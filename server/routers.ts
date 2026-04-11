import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { callDataApi } from "./_core/dataApi";
import { cacheGet, cacheSet, CACHE_TTL } from "./cache";
import { fetchYahooChart, fetchYahooNews } from "./yahooFallback";
import { computeIndicators, generateDailyAnalysis, calcSMA } from "./dataEngine";
import { runMultiAgentAnalysis } from "./multiAgentAnalysis";
import { scoreNewsSentiment, calculateSentimentSummary } from "./sentimentNews";
import { aiComplete, getProviderStatus } from "./lib/aiProvider";
import { syncPortfolioConcept, syncWatchlistConcept } from "./lib/cognitionOS";
import { z } from "zod";

/** Track whether the Data API quota is exhausted so we skip it quickly */
let dataApiExhausted = false;
let dataApiExhaustedAt = 0;
const EXHAUSTION_COOLDOWN = 300_000; // 5 minutes before retrying Data API

function isDataApiAvailable(): boolean {
  if (!dataApiExhausted) return true;
  if (Date.now() - dataApiExhaustedAt > EXHAUSTION_COOLDOWN) {
    dataApiExhausted = false;
    console.log("[Stock API] Data API cooldown expired, will retry");
    return true;
  }
  return false;
}

function markDataApiExhausted() {
  dataApiExhausted = true;
  dataApiExhaustedAt = Date.now();
  console.warn("[Stock API] Data API quota exhausted, switching to Yahoo fallback for 5 minutes");
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  stock: router({
    /**
     * Fetch stock chart data with caching + Yahoo Finance fallback.
     */
    getChart: publicProcedure
      .input(z.object({
        symbol: z.string(),
        range: z.string().default('1mo'),
        interval: z.string().default('1d'),
        region: z.string().default('GB'),
      }))
      .query(async ({ input }) => {
        const cacheKey = `chart:${input.symbol}:${input.range}:${input.interval}`;
        const ttl = input.range === '1d' ? CACHE_TTL.CHART_1D : CACHE_TTL.CHART_DEFAULT;

        const cached = cacheGet<unknown>(cacheKey);
        if (cached) return cached;

        if (isDataApiAvailable()) {
          try {
            const data = await callDataApi("YahooFinance/get_stock_chart", {
              query: {
                symbol: input.symbol,
                region: input.region,
                interval: input.interval,
                range: input.range,
                includeAdjustedClose: 'true',
              },
            }) as any;
            if (data?.message && String(data.message).includes('rate limit')) {
              console.warn(`[Stock API] Data API rate limited for ${input.symbol}`);
            } else if (data) {
              cacheSet(cacheKey, data, ttl);
              return data;
            }
          } catch (err: any) {
            const msg = String(err?.message || '');
            if (msg.includes('usage exhausted') || msg.includes('failed_precondition')) {
              markDataApiExhausted();
            } else {
              console.error("[Stock API] Data API chart error:", msg);
            }
          }
        }

        try {
          const yahooData = await fetchYahooChart(input.symbol, input.range, input.interval);
          if (yahooData) {
            cacheSet(cacheKey, yahooData, ttl);
            return yahooData;
          }
        } catch (err) {
          console.error("[Stock API] Yahoo fallback chart error:", err);
        }

        return null;
      }),

    /**
     * Fetch stock insights/news with caching + fallback.
     */
    getInsights: publicProcedure
      .input(z.object({
        symbol: z.string(),
      }))
      .query(async ({ input }) => {
        const cacheKey = `insights:${input.symbol}`;

        const cached = cacheGet<unknown>(cacheKey);
        if (cached) return cached;

        if (isDataApiAvailable()) {
          try {
            const data = await callDataApi("YahooFinance/get_stock_insights", {
              query: { symbol: input.symbol },
            });
            if (data) {
              cacheSet(cacheKey, data, CACHE_TTL.INSIGHTS);
              return data;
            }
          } catch (err: any) {
            const msg = String(err?.message || '');
            if (msg.includes('usage exhausted') || msg.includes('failed_precondition')) {
              markDataApiExhausted();
            }
          }
        }

        try {
          const newsItems = await fetchYahooNews(input.symbol);
          if (newsItems.length > 0) {
            const fallbackInsights = {
              finance: {
                result: {
                  news: newsItems.map(item => ({
                    title: item.title,
                    link: item.link,
                    publisher: item.source,
                    providerPublishTime: item.pubDate
                      ? Math.floor(new Date(item.pubDate).getTime() / 1000)
                      : Math.floor(Date.now() / 1000),
                    type: "STORY",
                    relatedTickers: [input.symbol],
                  })),
                },
              },
            };
            cacheSet(cacheKey, fallbackInsights, CACHE_TTL.INSIGHTS);
            return fallbackInsights;
          }
        } catch (err) {
          console.error("[Stock API] Yahoo fallback news error:", err);
        }

        return null;
      }),

    /**
     * Single-agent AI analysis — now via unified AI Provider
     * (Core AI Backend → Manus Forge fallback) with CognitionOS enrichment.
     */
    getAnalysis: publicProcedure
      .input(z.object({
        symbol: z.string(),
        name: z.string(),
        price: z.number(),
        change: z.number(),
        changePercent: z.number(),
        dayHigh: z.number(),
        dayLow: z.number(),
        fiftyTwoWeekHigh: z.number().optional(),
        fiftyTwoWeekLow: z.number().optional(),
        volume: z.number().optional(),
        previousClose: z.number().optional(),
        currency: z.string().optional(),
        exchange: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const cacheKey = `analysis:${input.symbol}`;
        const cached = cacheGet<unknown>(cacheKey);
        if (cached) return cached;

        try {
          const prompt = `You are a senior financial analyst AI. Analyze the following instrument and provide a structured investment analysis.

INSTRUMENT DATA:
- Symbol: ${input.symbol}
- Name: ${input.name}
- Current Price: ${input.currency || 'USD'} ${input.price.toFixed(3)}
- Change: ${input.change >= 0 ? '+' : ''}${input.change.toFixed(3)} (${input.changePercent >= 0 ? '+' : ''}${input.changePercent.toFixed(2)}%)
- Day Range: ${input.dayLow.toFixed(2)} — ${input.dayHigh.toFixed(2)}
${input.fiftyTwoWeekHigh ? `- 52-Week High: ${input.fiftyTwoWeekHigh.toFixed(2)}` : ''}
${input.fiftyTwoWeekLow ? `- 52-Week Low: ${input.fiftyTwoWeekLow.toFixed(2)}` : ''}
${input.volume ? `- Volume: ${input.volume.toLocaleString()}` : ''}
${input.previousClose ? `- Previous Close: ${input.previousClose.toFixed(3)}` : ''}
- Exchange: ${input.exchange || 'Unknown'}

Provide your analysis as JSON with these exact fields.`;

          const response = await aiComplete({
            messages: [
              { role: "system", content: "You are a senior financial analyst. Provide concise, data-driven analysis. Always respond with valid JSON. Include specific price levels." },
              { role: "user", content: prompt },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "stock_analysis",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    recommendation: { type: "string", description: "STRONG_BUY, BUY, HOLD, SELL, or STRONG_SELL" },
                    confidence: { type: "number", description: "0-100" },
                    summary: { type: "string", description: "2-3 sentence executive summary" },
                    bullCase: { type: "string", description: "Key bullish argument" },
                    bearCase: { type: "string", description: "Key bearish argument" },
                    keyLevels: {
                      type: "object",
                      properties: {
                        support: { type: "number" },
                        resistance: { type: "number" },
                        target: { type: "number" },
                      },
                      required: ["support", "resistance", "target"],
                      additionalProperties: false,
                    },
                    riskLevel: { type: "string", description: "LOW, MEDIUM, HIGH, or VERY_HIGH" },
                    catalysts: { type: "array", items: { type: "string" }, description: "2-3 catalysts" },
                  },
                  required: ["recommendation", "confidence", "summary", "bullCase", "bearCase", "keyLevels", "riskLevel", "catalysts"],
                  additionalProperties: false,
                },
              },
            },
            enrichWithKnowledgeGraph: {
              symbol: input.symbol,
              additionalTerms: [input.name],
            },
          });

          const analysis = JSON.parse(response.content);
          const VALID_RECS = ['STRONG_BUY', 'BUY', 'HOLD', 'SELL', 'STRONG_SELL'];
          const VALID_RISKS = ['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'];

          const result = {
            recommendation: VALID_RECS.includes(analysis.recommendation) ? analysis.recommendation : 'HOLD',
            confidence: Math.max(0, Math.min(100, Number(analysis.confidence) || 50)),
            summary: String(analysis.summary || 'Analysis unavailable'),
            bullCase: String(analysis.bullCase || 'No bull case provided'),
            bearCase: String(analysis.bearCase || 'No bear case provided'),
            keyLevels: {
              support: Number(analysis.keyLevels?.support) || input.price * 0.95,
              resistance: Number(analysis.keyLevels?.resistance) || input.price * 1.05,
              target: Number(analysis.keyLevels?.target) || input.price * 1.10,
            },
            riskLevel: VALID_RISKS.includes(analysis.riskLevel) ? analysis.riskLevel : 'MEDIUM',
            catalysts: Array.isArray(analysis.catalysts)
              ? analysis.catalysts.filter((c: unknown) => typeof c === 'string').slice(0, 5)
              : ['No catalysts identified'],
            analyzedAt: Date.now(),
            symbol: input.symbol,
            aiProvider: response.provider,
          };

          cacheSet(cacheKey, result, CACHE_TTL.ANALYSIS);
          return result;
        } catch (err) {
          console.error("[Stock API] Analysis error:", err);
          return null;
        }
      }),

    /**
     * Multi-Agent AI Analysis — 4 specialist agents + moderator.
     * Now uses unified AI Provider with CognitionOS enrichment.
     */
    getMultiAgentAnalysis: publicProcedure
      .input(z.object({
        symbol: z.string(),
        name: z.string(),
        price: z.number(),
        change: z.number(),
        changePercent: z.number(),
        dayHigh: z.number(),
        dayLow: z.number(),
        fiftyTwoWeekHigh: z.number().optional(),
        fiftyTwoWeekLow: z.number().optional(),
        volume: z.number().optional(),
        previousClose: z.number().optional(),
        currency: z.string().optional(),
        exchange: z.string().optional(),
        technicalSignals: z.array(z.string()).optional(),
        dailyTrend: z.string().optional(),
        dailyStrength: z.number().optional(),
      }))
      .query(async ({ input }) => {
        const cacheKey = `multiagent:${input.symbol}`;
        const cached = cacheGet<unknown>(cacheKey);
        if (cached) return cached;

        try {
          const result = await runMultiAgentAnalysis(input);
          cacheSet(cacheKey, result, CACHE_TTL.ANALYSIS);
          return result;
        } catch (err) {
          console.error("[Stock API] Multi-agent analysis error:", err);
          return null;
        }
      }),

    /**
     * Technical indicators computed from chart data.
     */
    getTechnicalIndicators: publicProcedure
      .input(z.object({
        symbol: z.string(),
        closes: z.array(z.number()),
        highs: z.array(z.number()),
        lows: z.array(z.number()),
        currentPrice: z.number(),
      }))
      .query(({ input }) => {
        const cacheKey = `indicators:${input.symbol}:${input.closes.length}`;
        const cached = cacheGet<unknown>(cacheKey);
        if (cached) return cached;

        const rawIndicators = computeIndicators(input.closes);
        const dailyAnalysis = generateDailyAnalysis(
          input.closes,
          input.highs,
          input.lows,
          input.currentPrice,
        );

        const lastVal = (arr: (number | null)[]): number => {
          for (let i = arr.length - 1; i >= 0; i--) {
            if (arr[i] !== null && arr[i] !== undefined) return arr[i] as number;
          }
          return NaN;
        };

        const indicators = {
          rsi14: lastVal(rawIndicators.rsi14),
          sma10: lastVal(calcSMA(input.closes, 10)),
          sma20: lastVal(rawIndicators.sma20),
          sma50: lastVal(rawIndicators.sma50),
          macd: {
            macd: lastVal(rawIndicators.macd.macd),
            signal: lastVal(rawIndicators.macd.signal),
            histogram: lastVal(rawIndicators.macd.histogram),
          },
          bollingerBands: {
            upper: lastVal(rawIndicators.bollingerBands.upper),
            middle: lastVal(rawIndicators.bollingerBands.middle),
            lower: lastVal(rawIndicators.bollingerBands.lower),
          },
        };

        const result = { indicators, dailyAnalysis };
        cacheSet(cacheKey, result, CACHE_TTL.CHART_DEFAULT);
        return result;
      }),

    /**
     * Sentiment-scored news analysis — via unified AI Provider.
     */
    getSentimentNews: publicProcedure
      .input(z.object({
        symbol: z.string(),
        instrumentName: z.string(),
        articles: z.array(z.object({
          title: z.string(),
          summary: z.string(),
          source: z.string(),
        })),
      }))
      .query(async ({ input }) => {
        const cacheKey = `sentiment:${input.symbol}:${input.articles.length}`;
        const cached = cacheGet<unknown>(cacheKey);
        if (cached) return cached;

        const scores = await scoreNewsSentiment(
          input.articles,
          input.symbol,
          input.instrumentName,
        );

        const scoredArticles = input.articles.map((article, i) => ({
          ...article,
          ...scores[i],
        }));

        const summary = calculateSentimentSummary(
          scoredArticles.map((a, i) => ({
            id: `scored-${i}`,
            title: a.title,
            summary: a.summary,
            source: a.source,
            url: '#',
            publishedAt: new Date().toISOString(),
            relatedSymbols: [input.symbol],
            sentiment: {
              label: a.sentiment,
              score: a.score,
              confidence: a.confidence,
            },
            impact: a.impact,
            category: a.category,
          })),
        );

        const result = { articles: scoredArticles, summary };
        cacheSet(cacheKey, result, CACHE_TTL.INSIGHTS);
        return result;
      }),

    /**
     * Kora Chat — AI portfolio assistant.
     * Now uses unified AI Provider with CognitionOS knowledge graph enrichment.
     */
    koraChat: publicProcedure
      .input(z.object({
        message: z.string(),
        portfolioContext: z.string(),
        history: z.array(z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string(),
        })).optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
            {
              role: 'system',
              content: `You are Kora, an expert AI portfolio assistant powered by the SeKondBrain AI Backend and CognitionOS knowledge graph. You have deep knowledge of financial markets, trading strategies, technical analysis, and risk management.

CURRENT PORTFOLIO CONTEXT:
${input.portfolioContext}

Rules:
- Be concise but thorough (2-4 paragraphs max)
- Reference specific positions and numbers from the portfolio
- Provide actionable insights, not generic advice
- When discussing risk, quantify it (e.g., "your USD/CHF exposure is $300k")
- Use professional financial language
- If asked about something outside your data, say so honestly
- Format key numbers and percentages clearly`,
            },
          ];

          // Add conversation history
          if (input.history && input.history.length > 0) {
            for (const msg of input.history.slice(-8)) {
              messages.push({ role: msg.role, content: msg.content });
            }
          }

          messages.push({ role: 'user', content: input.message });

          const response = await aiComplete({
            messages,
            enrichWithKnowledgeGraph: {
              symbol: 'portfolio',
              additionalTerms: ['BRNT', 'USD/CHF', 'trading'],
            },
          });

          return {
            reply: response.content || 'I was unable to generate a response. Please try again.',
            aiProvider: response.provider,
          };
        } catch (err) {
          console.error('[Kora Chat] Error:', err);
          return { reply: 'I encountered an error. Please try again in a moment.' };
        }
      }),

    /**
     * Get AI provider status — shows which backends are configured and healthy.
     */
    getAiProviderStatus: publicProcedure.query(() => {
      return getProviderStatus();
    }),

    /**
     * Sync a portfolio position to CognitionOS knowledge graph.
     */
    syncToCognitionOS: publicProcedure
      .input(z.object({
        symbol: z.string(),
        name: z.string(),
        quantity: z.number(),
        entryPrice: z.number(),
        currentPrice: z.number().optional(),
        exchange: z.string().optional(),
        type: z.enum(['equity', 'forex', 'commodity', 'etf']),
        openedDate: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          const conceptId = await syncPortfolioConcept(input);
          return { success: !!conceptId, conceptId };
        } catch (err) {
          console.error('[CognitionOS] Sync failed:', err);
          return { success: false, conceptId: null };
        }
      }),

    /**
     * Sync a watchlist item to CognitionOS knowledge graph.
     */
    syncWatchlistToCognitionOS: publicProcedure
      .input(z.object({
        symbol: z.string(),
        name: z.string(),
        currentPrice: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          const conceptId = await syncWatchlistConcept(input);
          return { success: !!conceptId, conceptId };
        } catch (err) {
          console.error('[CognitionOS] Watchlist sync failed:', err);
          return { success: false, conceptId: null };
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;

import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { aiInvoke } from "./lib/aiProvider";
import { getProviderStatus } from "./lib/aiProvider";
import { cacheGet, cacheSet, CACHE_TTL } from "./cache";
import { fetchYahooChart, fetchYahooNews } from "./yahooFallback";
import { computeIndicators, generateDailyAnalysis, calcSMA } from "./dataEngine";
import { runMultiAgentAnalysis } from "./multiAgentAnalysis";
import { scoreNewsSentiment, calculateSentimentSummary } from "./sentimentNews";
import { ingestScoredNews } from "./lib/newsIngestion";
import { ingestRecommendation, recallPreviousRecommendations } from "./lib/recommendationIngestion";
import { extractContext, getKnowledgeStatus } from "./lib/progressiveExtraction";
import { setupTradingDomain, getDomainStatus } from "./lib/tradingDomainSetup";
import { getCognitionOS } from "./lib/cognitionOSClient";
import { getMemoryVault } from "./lib/memoryVaultClient";
import { z } from "zod";

/** Yahoo Finance is the sole data source (no Manus Data API) */


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

        // Yahoo Finance direct (no Manus Data API)
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

        // Yahoo Finance direct (no Manus Data API)
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
     * Single-agent AI analysis with progressive extraction from CognitionOS.
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
          // Progressive extraction: pull context from CognitionOS + Memory Vault
          let knowledgeContext = '';
          try {
            const ctx = await extractContext(input.symbol, input.name);
            knowledgeContext = ctx.formattedContext;
          } catch (err) {
            console.warn('[Stock API] Progressive extraction failed, continuing without context:', err);
          }

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
${knowledgeContext}

Provide your analysis as JSON with these exact fields.`;

          const response = await aiInvoke({
            messages: [
              { role: "system", content: "You are a senior financial analyst. Provide concise, data-driven analysis. Always respond with valid JSON. Include specific price levels. If knowledge graph context is provided, incorporate past analysis patterns and known facts into your assessment." },
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
          });

          const content = response.choices[0]?.message?.content;
          if (!content || typeof content !== 'string') return null;

          const analysis = JSON.parse(content);
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
          };

          cacheSet(cacheKey, result, CACHE_TTL.ANALYSIS);

          // Fire-and-forget: push recommendation into CognitionOS + Memory Vault
          ingestRecommendation({
            symbol: input.symbol,
            instrumentName: input.name,
            finalVerdict: result.recommendation,
            confidence: result.confidence,
            consensusScore: result.confidence - 50, // Normalize to -50..+50
            moderatorSummary: result.summary,
            agentOpinions: [{
              agentName: 'SingleAgent',
              role: 'Senior Financial Analyst',
              verdict: result.recommendation,
              confidence: result.confidence,
              reasoning: `${result.bullCase} vs ${result.bearCase}`,
              keyPoints: result.catalysts,
            }],
            priceTarget: result.keyLevels.target,
            stopLoss: result.keyLevels.support,
            riskLevel: result.riskLevel,
            analysisType: 'single_agent',
          }).catch(err => console.error('[Stock API] Recommendation ingestion failed:', err));

          return result;
        } catch (err) {
          console.error("[Stock API] Analysis error:", err);
          return null;
        }
      }),

    /**
     * Multi-Agent AI Analysis — 4 specialist agents + moderator.
     * Now with progressive extraction from CognitionOS knowledge graph.
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

          // Fire-and-forget: push multi-agent recommendation into CognitionOS + Memory Vault
          if (result) {
            ingestRecommendation({
              symbol: input.symbol,
              instrumentName: input.name,
              finalVerdict: result.consensus?.recommendation || result.finalVerdict?.action || 'HOLD',
              confidence: result.consensus?.confidence || 50,
              consensusScore: (result.consensus?.confidence || 50) - 50,
              moderatorSummary: result.consensus?.summary || result.debate || '',
              agentOpinions: (result.agents || []).map(a => ({
                agentName: a.agent,
                role: a.role,
                verdict: a.stance,
                confidence: a.confidence,
                reasoning: a.reasoning,
                keyPoints: a.keyPoints || [],
              })),
              priceTarget: result.finalVerdict?.targetPrice,
              stopLoss: result.finalVerdict?.stopLoss,
              timeHorizon: result.finalVerdict?.timeHorizon,
              riskLevel: result.finalVerdict?.riskRewardRatio > 2 ? 'LOW' : result.finalVerdict?.riskRewardRatio > 1 ? 'MEDIUM' : 'HIGH',
              analysisType: 'multi_agent',
            }).catch(err => console.error('[Stock API] Multi-agent recommendation ingestion failed:', err));
          }

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
     * Sentiment-scored news analysis.
     * Now pushes scored articles into CognitionOS + Memory Vault.
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

        // Fire-and-forget: push scored news into CognitionOS + Memory Vault
        ingestScoredNews(
          scoredArticles.map(a => ({
            title: a.title,
            summary: a.summary,
            source: a.source,
            sentiment: a.sentiment,
            score: a.score,
            confidence: a.confidence,
            impact: a.impact,
            category: a.category,
          })),
          input.symbol,
          input.instrumentName,
        ).catch(err => console.error('[Stock API] News ingestion failed:', err));

        return result;
      }),

    /**
     * Kora Chat — AI portfolio assistant with Memory Vault context.
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
          // Enrich with Memory Vault context
          let memoryContext = '';
          try {
            const memVault = getMemoryVault();
            const recentMemory = await memVault.search({
              query: input.message,
              limit: 3,
            });
            if (recentMemory.episodes && recentMemory.episodes.length > 0) {
              memoryContext = '\n\nRELEVANT MEMORY (from past analyses):\n' +
                recentMemory.episodes.map(ep =>
                  `[${ep.timestamp}] ${ep.summary}: ${(ep.content || '').slice(0, 200)}`
                ).join('\n');
            }
          } catch {
            // Memory search is optional
          }

          // Enrich with CognitionOS knowledge graph
          let graphContext = '';
          try {
            const cogOS = getCognitionOS();
            const related = await cogOS.vectorSearch(input.message, 3, 0.3);
            if (related.length > 0) {
              graphContext = '\n\nKNOWLEDGE GRAPH CONTEXT:\n' +
                related.map(r => `• ${r.name}: ${r.description.slice(0, 150)}`).join('\n');
            }
          } catch {
            // Knowledge graph search is optional
          }

          const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
            {
              role: 'system',
              content: `You are Kora, an expert AI portfolio assistant with access to a knowledge graph and memory vault. You have deep knowledge of financial markets, trading strategies, technical analysis, and risk management.

CURRENT PORTFOLIO CONTEXT:
${input.portfolioContext}
${memoryContext}
${graphContext}

Rules:
- Be concise but thorough (2-4 paragraphs max)
- Reference specific positions and numbers from the portfolio
- When you have memory context, reference past analyses and how the situation has evolved
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

          const response = await aiInvoke({ messages });
          const reply = response?.choices?.[0]?.message?.content;

          // Fire-and-forget: store the conversation as a Memory Vault episode
          const memVault = getMemoryVault();
          memVault.createEpisode({
            content: `User asked: "${input.message}"\nKora replied: "${typeof reply === 'string' ? reply.slice(0, 500) : 'error'}"`,
            summary: `Kora chat: ${input.message.slice(0, 80)}`,
            extra_metadata: { type: 'kora_conversation' },
          }).catch(() => {});

          return { reply: typeof reply === 'string' ? reply : 'I was unable to generate a response. Please try again.' };
        } catch (err) {
          console.error('[Kora Chat] Error:', err);
          return { reply: 'I encountered an error. Please try again in a moment.' };
        }
      }),
  }),

  /**
   * CognitionOS domain management endpoints.
   */
  cognition: router({
    /**
     * Set up the trading domain seed graph in CognitionOS.
     * Idempotent — safe to call multiple times.
     */
    setupDomain: publicProcedure.mutation(async () => {
      try {
        const result = await setupTradingDomain();
        return result;
      } catch (err: any) {
        console.error('[CognitionOS] Domain setup failed:', err);
        return {
          success: false,
          conceptsCreated: 0,
          relationshipsCreated: 0,
          errors: [err.message],
        };
      }
    }),

    /**
     * Get the current CognitionOS domain status.
     */
    getDomainStatus: publicProcedure.query(async () => {
      try {
        return await getDomainStatus();
      } catch (err: any) {
        return { healthy: false, services: { error: err.message }, graphReady: false };
      }
    }),

    /**
     * Get AI provider status (which provider is active, circuit breaker state).
     */
    getProviderStatus: publicProcedure.query(() => {
      return getProviderStatus();
    }),

    /**
     * Get knowledge status for a specific symbol.
     */
    getKnowledgeStatus: publicProcedure
      .input(z.object({ symbol: z.string() }))
      .query(async ({ input }) => {
        try {
          return await getKnowledgeStatus(input.symbol);
        } catch {
          return { conceptsKnown: 0, pastDecisions: 0, episodesStored: 0 };
        }
      }),

    /**
     * Search the knowledge graph.
     */
    search: publicProcedure
      .input(z.object({
        query: z.string(),
        topK: z.number().default(10),
      }))
      .query(async ({ input }) => {
        try {
          const cogOS = getCognitionOS();
          return await cogOS.vectorSearch(input.query, input.topK, 0.2);
        } catch (err: any) {
          console.error('[CognitionOS] Search failed:', err);
          return [];
        }
      }),
  }),

  /**
   * Memory Vault endpoints for agentic memory.
   */
  memory: router({
    /**
     * Search Memory Vault for past episodes.
     */
    search: publicProcedure
      .input(z.object({
        query: z.string(),
        limit: z.number().default(10),
      }))
      .query(async ({ input }) => {
        try {
          const memVault = getMemoryVault();
          const result = await memVault.search({
            query: input.query,
            limit: input.limit,
          });
          return result.episodes || [];
        } catch (err: any) {
          console.error('[MemoryVault] Search failed:', err);
          return [];
        }
      }),

    /**
     * Get Memory Vault health status.
     */
    health: publicProcedure.query(async () => {
      try {
        const memVault = getMemoryVault();
        return await memVault.health();
      } catch (err: any) {
        return { healthy: false, neo4j_connected: false, postgres_connected: false };
      }
    }),
  }),
});

export type AppRouter = typeof appRouter;

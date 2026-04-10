import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { callDataApi } from "./_core/dataApi";
import { invokeLLM } from "./_core/llm";
import { cacheGet, cacheSet, CACHE_TTL } from "./cache";
import { fetchYahooChart, fetchYahooNews } from "./yahooFallback";
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

        // Check cache first
        const cached = cacheGet<unknown>(cacheKey);
        if (cached) {
          return cached;
        }

        // Try Data API first (if not exhausted)
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
            // Check for rate limit message in response
            if (data?.message && String(data.message).includes('rate limit')) {
              console.warn(`[Stock API] Data API rate limited for ${input.symbol}`);
              // Fall through to Yahoo fallback
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

        // Fallback: Direct Yahoo Finance
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

        // Check cache first
        const cached = cacheGet<unknown>(cacheKey);
        if (cached) {
          return cached;
        }

        // Try Data API first
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

        // Fallback: Yahoo RSS news
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
     * AI-powered stock analysis using LLM with caching.
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

        // Check cache first (30 min TTL)
        const cached = cacheGet<unknown>(cacheKey);
        if (cached) {
          return cached;
        }

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

Provide your analysis as JSON with these exact fields. Be specific and actionable.`;

          const response = await invokeLLM({
            messages: [
              {
                role: "system",
                content: "You are a senior financial analyst. Provide concise, data-driven analysis. Always respond with valid JSON matching the requested schema. Include specific price levels and percentages in your analysis. Your confidence should reflect the strength of the technical and fundamental signals available."
              },
              {
                role: "user",
                content: prompt,
              },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "stock_analysis",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    recommendation: {
                      type: "string",
                      description: "One of: STRONG_BUY, BUY, HOLD, SELL, STRONG_SELL",
                    },
                    confidence: {
                      type: "number",
                      description: "Confidence score from 0 to 100",
                    },
                    summary: {
                      type: "string",
                      description: "2-3 sentence executive summary of the analysis",
                    },
                    bullCase: {
                      type: "string",
                      description: "Key bullish argument in 1-2 sentences",
                    },
                    bearCase: {
                      type: "string",
                      description: "Key bearish argument in 1-2 sentences",
                    },
                    keyLevels: {
                      type: "object",
                      properties: {
                        support: { type: "number", description: "Nearest support price level" },
                        resistance: { type: "number", description: "Nearest resistance price level" },
                        target: { type: "number", description: "Price target for the next 1-3 months" },
                      },
                      required: ["support", "resistance", "target"],
                      additionalProperties: false,
                    },
                    riskLevel: {
                      type: "string",
                      description: "One of: LOW, MEDIUM, HIGH, VERY_HIGH",
                    },
                    catalysts: {
                      type: "array",
                      items: { type: "string" },
                      description: "2-3 upcoming catalysts or factors to watch",
                    },
                  },
                  required: [
                    "recommendation", "confidence", "summary", "bullCase",
                    "bearCase", "keyLevels", "riskLevel", "catalysts",
                  ],
                  additionalProperties: false,
                },
              },
            },
          });

          const content = response.choices[0]?.message?.content;
          if (!content || typeof content !== 'string') {
            return null;
          }

          const analysis = JSON.parse(content);

          // Validate and sanitize LLM output
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
          return result;
        } catch (err) {
          console.error("[Stock API] Analysis error:", err);
          return null;
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;

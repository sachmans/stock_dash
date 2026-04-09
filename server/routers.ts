import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { callDataApi } from "./_core/dataApi";
import { invokeLLM } from "./_core/llm";
import { z } from "zod";

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
     * Fetch stock chart data from Yahoo Finance via the Manus Data API.
     * Returns the raw Yahoo Finance chart response.
     */
    getChart: publicProcedure
      .input(z.object({
        symbol: z.string(),
        range: z.string().default('1mo'),
        interval: z.string().default('1d'),
        region: z.string().default('GB'),
      }))
      .query(async ({ input }) => {
        try {
          const data = await callDataApi("YahooFinance/get_stock_chart", {
            query: {
              symbol: input.symbol,
              region: input.region,
              interval: input.interval,
              range: input.range,
              includeAdjustedClose: 'true',
            },
          });
          return data;
        } catch (err) {
          console.error("[Stock API] Chart fetch error:", err);
          return null;
        }
      }),

    /**
     * Fetch stock insights/news from Yahoo Finance via the Manus Data API.
     * Returns the raw Yahoo Finance insights response.
     */
    getInsights: publicProcedure
      .input(z.object({
        symbol: z.string(),
      }))
      .query(async ({ input }) => {
        try {
          const data = await callDataApi("YahooFinance/get_stock_insights", {
            query: {
              symbol: input.symbol,
            },
          });
          return data;
        } catch (err) {
          console.error("[Stock API] Insights fetch error:", err);
          return null;
        }
      }),

    /**
     * AI-powered stock analysis using LLM.
     * Takes market data context and returns a structured analysis
     * with buy/sell/hold recommendation and confidence score.
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
                        support: {
                          type: "number",
                          description: "Nearest support price level",
                        },
                        resistance: {
                          type: "number",
                          description: "Nearest resistance price level",
                        },
                        target: {
                          type: "number",
                          description: "Price target for the next 1-3 months",
                        },
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
                    "recommendation",
                    "confidence",
                    "summary",
                    "bullCase",
                    "bearCase",
                    "keyLevels",
                    "riskLevel",
                    "catalysts",
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

          const recommendation = VALID_RECS.includes(analysis.recommendation)
            ? analysis.recommendation
            : 'HOLD';
          const riskLevel = VALID_RISKS.includes(analysis.riskLevel)
            ? analysis.riskLevel
            : 'MEDIUM';
          const confidence = Math.max(0, Math.min(100, Number(analysis.confidence) || 50));

          const keyLevels = {
            support: Number(analysis.keyLevels?.support) || input.price * 0.95,
            resistance: Number(analysis.keyLevels?.resistance) || input.price * 1.05,
            target: Number(analysis.keyLevels?.target) || input.price * 1.10,
          };

          const catalysts = Array.isArray(analysis.catalysts)
            ? analysis.catalysts.filter((c: unknown) => typeof c === 'string').slice(0, 5)
            : ['No catalysts identified'];

          return {
            recommendation,
            confidence,
            summary: String(analysis.summary || 'Analysis unavailable'),
            bullCase: String(analysis.bullCase || 'No bull case provided'),
            bearCase: String(analysis.bearCase || 'No bear case provided'),
            keyLevels,
            riskLevel,
            catalysts,
            analyzedAt: Date.now(),
            symbol: input.symbol,
          };
        } catch (err) {
          console.error("[Stock API] Analysis error:", err);
          return null;
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;

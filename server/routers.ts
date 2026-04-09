import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { callDataApi } from "./_core/dataApi";
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
  }),
});

export type AppRouter = typeof appRouter;

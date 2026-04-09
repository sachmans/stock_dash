/**
 * Stock Portfolio Tracker — Watchlist Data Hook
 * Design: Dark Command Center
 * 
 * Fetches live quote data for all watchlist items via tRPC.
 * Auto-refreshes every 30 seconds.
 */

import { useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import type { StockQuote, WatchlistItem } from '@/lib/types';

function parseQuoteFromChart(data: any, symbol: string): StockQuote | null {
  try {
    if (!data?.chart?.result?.[0]) return null;

    const meta = data.chart.result[0].meta;

    return {
      symbol: meta.symbol,
      name: meta.longName || meta.shortName || symbol,
      price: meta.regularMarketPrice ?? 0,
      previousClose: meta.chartPreviousClose || meta.previousClose || 0,
      change: meta.regularMarketPrice - (meta.chartPreviousClose || meta.previousClose || meta.regularMarketPrice),
      changePercent:
        ((meta.regularMarketPrice - (meta.chartPreviousClose || meta.previousClose || meta.regularMarketPrice)) /
          (meta.chartPreviousClose || meta.previousClose || meta.regularMarketPrice)) *
        100,
      dayHigh: meta.regularMarketDayHigh || 0,
      dayLow: meta.regularMarketDayLow || 0,
      volume: meta.regularMarketVolume || 0,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh || 0,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow || 0,
      currency: meta.currency || 'USD',
      exchange: meta.exchangeName || '',
      marketState: meta.marketState || 'CLOSED',
      lastUpdated: Date.now(),
    };
  } catch (err) {
    console.error(`Failed to parse watchlist quote for ${symbol}:`, err);
    return null;
  }
}

/**
 * Hook to fetch a single watchlist item's quote data.
 * Uses a 1-day range with 1-day interval to get just the latest quote.
 */
export function useWatchlistQuote(yahooSymbol: string) {
  const queryInput = useMemo(() => ({
    symbol: yahooSymbol,
    range: '1d',
    interval: '1d',
    region: 'GB',
  }), [yahooSymbol]);

  const { data: rawData, isLoading, error } = trpc.stock.getChart.useQuery(
    queryInput,
    {
      refetchInterval: 30000,
      refetchIntervalInBackground: false,
      staleTime: 15000,
    }
  );

  const quote = useMemo(() => {
    if (!rawData) return null;
    return parseQuoteFromChart(rawData, yahooSymbol);
  }, [rawData, yahooSymbol]);

  return { quote, loading: isLoading, error: error?.message ?? null };
}

/**
 * Hook to fetch quotes for multiple watchlist items.
 * Returns a map of yahooSymbol -> StockQuote.
 */
export function useWatchlistData(items: WatchlistItem[]) {
  // We use individual queries for each item since tRPC batches them automatically
  const queries = items.map((item) => ({
    symbol: item.yahooSymbol,
    range: '1d' as const,
    interval: '1d' as const,
    region: 'GB' as const,
  }));

  // Use useQueries pattern - but since tRPC doesn't have useQueries easily,
  // we'll use the component-level approach with individual hooks
  // This hook returns the items with their query configs for the component to use
  return { items, queries };
}

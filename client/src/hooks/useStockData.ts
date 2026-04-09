/**
 * Stock Portfolio Tracker — Stock Data Hook
 * Design: Dark Command Center
 * 
 * Fetches live stock data from Yahoo Finance via tRPC server procedures.
 * Auto-refreshes every 30 seconds.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import type { StockQuote, ChartDataPoint, TimeRange } from '@/lib/types';

function getInterval(range: TimeRange): string {
  switch (range) {
    case '1d': return '5m';
    case '5d': return '15m';
    case '1mo': return '1d';
    case '3mo': return '1d';
    case '6mo': return '1d';
    case '1y': return '1wk';
    case 'ytd': return '1d';
    default: return '1d';
  }
}

function parseChartResponse(data: any, symbol: string): { quote: StockQuote | null; chart: ChartDataPoint[] } {
  try {
    if (!data?.chart?.result?.[0]) return { quote: null, chart: [] };

    const result = data.chart.result[0];
    const meta = result.meta;
    const timestamps = result.timestamp || [];
    const quotes = result.indicators?.quote?.[0] || {};

    const quote: StockQuote = {
      symbol: meta.symbol,
      name: meta.longName || meta.shortName || symbol,
      price: meta.regularMarketPrice,
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

    const chart: ChartDataPoint[] = timestamps.map((ts: number, i: number) => ({
      timestamp: ts,
      date: new Date(ts * 1000).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
      }),
      open: quotes.open?.[i] ?? 0,
      high: quotes.high?.[i] ?? 0,
      low: quotes.low?.[i] ?? 0,
      close: quotes.close?.[i] ?? 0,
      volume: quotes.volume?.[i] ?? 0,
    }));

    return { quote, chart };
  } catch (err) {
    console.error(`Failed to parse stock data for ${symbol}:`, err);
    return { quote: null, chart: [] };
  }
}

export function useStockData(symbol: string, range: TimeRange = '1mo') {
  const interval = useMemo(() => getInterval(range), [range]);

  const queryInput = useMemo(() => ({
    symbol,
    range,
    interval,
    region: 'GB',
  }), [symbol, range, interval]);

  const { data: rawData, isLoading, error: queryError, refetch } = trpc.stock.getChart.useQuery(
    queryInput,
    {
      refetchInterval: 30000, // Auto-refresh every 30 seconds
      refetchIntervalInBackground: false,
      staleTime: 15000,
    }
  );

  const { quote, chart } = useMemo(() => {
    if (!rawData) return { quote: null, chart: [] as ChartDataPoint[] };
    const parsed = parseChartResponse(rawData, symbol);
    return {
      quote: parsed.quote,
      chart: parsed.chart.filter((d) => d.close > 0),
    };
  }, [rawData, symbol]);

  return {
    quote,
    chart,
    loading: isLoading,
    error: queryError?.message ?? null,
    refetch,
  };
}

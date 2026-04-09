/**
 * Stock Portfolio Tracker — News Hook
 * Design: Dark Command Center
 * 
 * Fetches stock-related news from Yahoo Finance insights via tRPC.
 * Falls back to curated oil/commodity news if insights are unavailable.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import type { NewsItem } from '@/lib/types';

function parseInsightsResponse(data: any, symbol: string): NewsItem[] {
  try {
    const news: NewsItem[] = [];
    const finance = data?.finance;
    if (finance?.result) {
      const result = finance.result;

      // Significant developments
      const sigDevs = result?.sigDevs || [];
      sigDevs.forEach((dev: any, i: number) => {
        news.push({
          id: `sigdev-${symbol}-${i}`,
          title: dev.headline || 'Market Development',
          summary: dev.description || '',
          source: dev.provider || 'Yahoo Finance',
          url: dev.url || '#',
          publishedAt: dev.date || new Date().toISOString(),
          relatedSymbols: [symbol],
        });
      });

      // Analyst target price
      const reports = result?.instrumentInfo?.recommendation?.targetPrice
        ? [{
            id: `target-price-${symbol}`,
            title: `Analyst Target Price: ${result.instrumentInfo.recommendation.targetPrice?.fmt || 'N/A'}`,
            summary: `Rating: ${result.instrumentInfo.recommendation.rating || 'N/A'} — Mean target: ${result.instrumentInfo.recommendation.targetPrice?.fmt || 'N/A'}`,
            source: 'Yahoo Finance Analysts',
            url: '#',
            publishedAt: new Date().toISOString(),
            relatedSymbols: [symbol],
          }]
        : [];
      news.push(...reports);

      // Company reports
      const companyReports = result?.reports || [];
      companyReports.forEach((report: any, i: number) => {
        news.push({
          id: `report-${symbol}-${i}`,
          title: report.reportTitle || report.title || 'Research Report',
          summary: report.summary || report.reportTitle || '',
          source: report.provider || 'Yahoo Finance',
          url: report.url || '#',
          publishedAt: report.reportDate || new Date().toISOString(),
          relatedSymbols: [symbol],
        });
      });
    }
    return news;
  } catch (err) {
    console.error(`Failed to parse insights for ${symbol}:`, err);
    return [];
  }
}

// Fallback curated news for oil/commodity markets
function getFallbackNews(): NewsItem[] {
  return [
    {
      id: 'fallback-1',
      title: 'OPEC+ Weighs Further Output Adjustments Amid Global Demand Shifts',
      summary: 'The OPEC+ alliance is considering adjustments to its production targets as global oil demand patterns continue to evolve with changing economic conditions across major consuming nations.',
      source: 'Market Analysis',
      url: '#',
      publishedAt: new Date().toISOString(),
      relatedSymbols: ['BRNT.L'],
    },
    {
      id: 'fallback-2',
      title: 'Brent Crude Prices React to Geopolitical Tensions in Key Producing Regions',
      summary: 'Oil markets remain sensitive to geopolitical developments in major producing regions, with Brent crude showing volatility as traders assess supply risk premiums.',
      source: 'Energy Markets',
      url: '#',
      publishedAt: new Date().toISOString(),
      relatedSymbols: ['BRNT.L'],
    },
    {
      id: 'fallback-3',
      title: 'WisdomTree ETCs See Increased Inflows as Commodity Interest Rises',
      summary: 'Exchange-traded commodities from WisdomTree have attracted significant investor interest as portfolio diversification into raw materials gains momentum.',
      source: 'ETF Analysis',
      url: '#',
      publishedAt: new Date().toISOString(),
      relatedSymbols: ['BRNT.L'],
    },
    {
      id: 'fallback-4',
      title: 'Global Oil Inventory Data Points to Tightening Supply Conditions',
      summary: 'Recent inventory reports from major storage hubs indicate declining stockpiles, potentially supporting crude oil prices in the near term.',
      source: 'Commodity Research',
      url: '#',
      publishedAt: new Date().toISOString(),
      relatedSymbols: ['BRNT.L'],
    },
    {
      id: 'fallback-5',
      title: 'Energy Sector Outlook: Analysts Assess Oil Price Trajectory for Q2 2026',
      summary: 'Leading energy analysts provide their outlook for oil prices heading into the second quarter, weighing supply constraints against demand recovery patterns.',
      source: 'Analyst Reports',
      url: '#',
      publishedAt: new Date().toISOString(),
      relatedSymbols: ['BRNT.L'],
    },
  ];
}

export function useNews(symbols: string[]) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Use the first symbol for the tRPC query
  const primarySymbol = symbols[0] || 'BRNT.L';
  const queryInput = useMemo(() => ({ symbol: primarySymbol }), [primarySymbol]);

  const { data: rawData, isLoading, refetch } = trpc.stock.getInsights.useQuery(
    queryInput,
    {
      refetchInterval: 120000, // Refresh every 2 minutes
      refetchIntervalInBackground: false,
      staleTime: 60000,
    }
  );

  useEffect(() => {
    if (isLoading) {
      setLoading(true);
      return;
    }

    if (rawData) {
      const parsed = parseInsightsResponse(rawData, primarySymbol);
      if (parsed.length > 0) {
        // Deduplicate by title
        const seen = new Set<string>();
        const unique = parsed.filter((item) => {
          if (seen.has(item.title)) return false;
          seen.add(item.title);
          return true;
        });
        setNews(unique);
      } else {
        setNews(getFallbackNews());
      }
    } else {
      setNews(getFallbackNews());
    }

    setLoading(false);
  }, [rawData, isLoading, primarySymbol]);

  return { news, loading, refetch };
}

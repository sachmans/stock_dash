/**
 * Stock Portfolio Tracker — Type Definitions
 * Design: Dark Command Center
 */

export interface Position {
  id: string;
  symbol: string;
  yahooSymbol: string;
  name: string;
  exchange: string;
  quantity: number;
  avgPrice: number;
  currency: string;
  openedDate: string;
  positionId?: string;
}

export interface WatchlistItem {
  id: string;
  symbol: string;
  yahooSymbol: string;
  name: string;
  exchange: string;
  currency: string;
  category: 'commodity' | 'stock' | 'etf' | 'crypto';
}

export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  currency: string;
  exchange: string;
  marketState: string;
  lastUpdated: number;
}

export interface ChartDataPoint {
  timestamp: number;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  imageUrl?: string;
  relatedSymbols?: string[];
}

export interface PortfolioSummary {
  totalValue: number;
  totalCost: number;
  totalPnL: number;
  totalPnLPercent: number;
  currency: string;
}

export type TimeRange = '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' | 'ytd';
export type ChartInterval = '1m' | '5m' | '15m' | '1d' | '1wk';

/**
 * Stock Portfolio Tracker — Type Definitions
 * Design: Dark Command Center
 */

/** Asset type discriminator for portfolio items */
export type AssetType = 'commodity' | 'stock' | 'etf' | 'forex';

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
  assetType?: AssetType;
}

/**
 * Forex position representing a currency pair trade.
 * Tracks the bought and sold currencies with their amounts and the entry rate.
 */
export interface ForexPosition {
  id: string;
  /** Display symbol, e.g. "USD/CHF" */
  symbol: string;
  /** Yahoo Finance symbol for live rate, e.g. "USDCHF=X" */
  yahooSymbol: string;
  /** Descriptive name */
  name: string;
  /** The currency that was bought */
  boughtCurrency: string;
  /** Amount of the bought currency */
  boughtAmount: number;
  /** The currency that was sold */
  soldCurrency: string;
  /** Amount of the sold currency */
  soldAmount: number;
  /** Entry exchange rate (sold/bought) */
  entryRate: number;
  /** Date the trade was executed */
  tradeDate: string;
  /** Direction: 'buy' means bought the base currency */
  direction: 'buy' | 'sell';
}

export interface WatchlistItem {
  id: string;
  symbol: string;
  yahooSymbol: string;
  name: string;
  exchange: string;
  currency: string;
  category: 'commodity' | 'stock' | 'etf' | 'crypto' | 'forex';
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

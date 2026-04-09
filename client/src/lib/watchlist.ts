/**
 * Stock Portfolio Tracker — Watchlist Store
 * Design: Dark Command Center
 * 
 * Manages watchlist items using localStorage for persistence.
 * Pre-loaded with Gold, Silver, and DEWA.
 * Watchlist is separate from portfolio positions.
 */

import type { WatchlistItem } from './types';

const STORAGE_KEY = 'stock-tracker-watchlist';

const DEFAULT_WATCHLIST: WatchlistItem[] = [
  {
    id: 'watch-gold',
    symbol: 'Gold',
    yahooSymbol: 'GC=F',
    name: 'Gold Futures',
    exchange: 'COMEX',
    currency: 'USD',
    category: 'commodity',
  },
  {
    id: 'watch-silver',
    symbol: 'Silver',
    yahooSymbol: 'SI=F',
    name: 'Silver Futures',
    exchange: 'COMEX',
    currency: 'USD',
    category: 'commodity',
  },
  {
    id: 'watch-dewa',
    symbol: 'DEWA',
    yahooSymbol: 'DEWA.AE',
    name: 'Dubai Electricity & Water Authority',
    exchange: 'DFM',
    currency: 'AED',
    category: 'stock',
  },
];

export function getWatchlist(): WatchlistItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // fall through to defaults
  }
  saveWatchlist(DEFAULT_WATCHLIST);
  return DEFAULT_WATCHLIST;
}

export function saveWatchlist(items: WatchlistItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function addToWatchlist(item: Omit<WatchlistItem, 'id'>): WatchlistItem {
  const items = getWatchlist();
  // Prevent duplicates by yahooSymbol
  if (items.some((i) => i.yahooSymbol === item.yahooSymbol)) {
    return items.find((i) => i.yahooSymbol === item.yahooSymbol)!;
  }
  const newItem: WatchlistItem = {
    ...item,
    id: `watch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  };
  items.push(newItem);
  saveWatchlist(items);
  return newItem;
}

export function removeFromWatchlist(id: string): void {
  const items = getWatchlist().filter((i) => i.id !== id);
  saveWatchlist(items);
}

export function resetWatchlistToDefaults(): void {
  saveWatchlist(DEFAULT_WATCHLIST);
}

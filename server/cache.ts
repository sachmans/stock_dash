/**
 * Simple in-memory cache with TTL for stock data.
 * Prevents hammering the Data API and handles quota exhaustion gracefully.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

export function cacheSet<T>(key: string, data: T, ttlMs: number): void {
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

/** Clear all cache entries (used in tests) */
export function cacheClear(): void {
  store.clear();
}

/** Cache TTLs */
export const CACHE_TTL = {
  CHART_1D: 60_000,       // 1 minute for intraday
  CHART_DEFAULT: 300_000,  // 5 minutes for daily/weekly
  INSIGHTS: 600_000,       // 10 minutes for news/insights
  ANALYSIS: 1_800_000,     // 30 minutes for AI analysis
} as const;

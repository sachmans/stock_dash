/**
 * Direct Yahoo Finance fallback with rate limiting.
 * Used when the Manus Data API quota is exhausted.
 * Fetches data directly from Yahoo Finance public endpoints.
 * Includes a request queue to avoid per-second rate limits.
 */

const YAHOO_BASE = "https://query1.finance.yahoo.com";

/* ─── Rate limiter: max 3 requests per second ─── */
let lastRequestTime = 0;
const MIN_INTERVAL_MS = 350; // ~3 req/sec

async function rateLimitedFetch(url: string, options: RequestInit): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
  return fetch(url, options);
}

interface YahooChartResult {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        previousClose?: number;
        currency?: string;
        exchangeName?: string;
        symbol?: string;
        shortName?: string;
        regularMarketDayHigh?: number;
        regularMarketDayLow?: number;
        fiftyTwoWeekHigh?: number;
        fiftyTwoWeekLow?: number;
        regularMarketVolume?: number;
        regularMarketTime?: number;
        chartPreviousClose?: number;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }>;
        adjclose?: Array<{
          adjclose?: (number | null)[];
        }>;
      };
    }>;
    error?: { code?: string; description?: string };
  };
  message?: string;
}

export async function fetchYahooChart(
  symbol: string,
  range: string = "1mo",
  interval: string = "1d",
): Promise<YahooChartResult | null> {
  try {
    const url = `${YAHOO_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includeAdjustedClose=true`;
    const res = await rateLimitedFetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      // If rate limited, wait and retry once
      if (res.status === 429) {
        console.warn(`[Yahoo Fallback] Rate limited for ${symbol}, retrying in 2s...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        const retry = await rateLimitedFetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json",
          },
          signal: AbortSignal.timeout(15_000),
        });
        if (!retry.ok) return null;
        return await retry.json() as YahooChartResult;
      }
      console.warn(`[Yahoo Fallback] Chart HTTP ${res.status} for ${symbol}`);
      return null;
    }
    const data = await res.json() as YahooChartResult;
    // Check for rate limit message in response body
    if (data.message && data.message.includes('rate limit')) {
      console.warn(`[Yahoo Fallback] Rate limit in body for ${symbol}, retrying in 2s...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      const retry = await rateLimitedFetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "application/json",
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!retry.ok) return null;
      return await retry.json() as YahooChartResult;
    }
    return data;
  } catch (err) {
    console.warn(`[Yahoo Fallback] Chart error for ${symbol}:`, err);
    return null;
  }
}

interface YahooSearchResult {
  quotes?: Array<{
    symbol?: string;
    shortname?: string;
    longname?: string;
    exchange?: string;
    quoteType?: string;
  }>;
}

export async function fetchYahooSearch(
  query: string,
): Promise<YahooSearchResult | null> {
  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=5&newsCount=0`;
    const res = await rateLimitedFetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return await res.json() as YahooSearchResult;
  } catch {
    return null;
  }
}

/**
 * Fetch news from Yahoo Finance RSS feed as a fallback.
 */
export async function fetchYahooNews(
  symbol: string,
): Promise<Array<{ title: string; link: string; pubDate: string; source: string }>> {
  try {
    const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`;
    const res = await rateLimitedFetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const text = await res.text();

    // Simple XML parsing for RSS items
    const items: Array<{ title: string; link: string; pubDate: string; source: string }> = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(text)) !== null) {
      const itemXml = match[1];
      const title = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
        || itemXml.match(/<title>(.*?)<\/title>/)?.[1]
        || "";
      const link = itemXml.match(/<link>(.*?)<\/link>/)?.[1] || "";
      const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || "";
      const source = itemXml.match(/<source[^>]*>(.*?)<\/source>/)?.[1] || "Yahoo Finance";
      if (title) {
        items.push({ title, link, pubDate, source });
      }
    }
    return items.slice(0, 10);
  } catch {
    return [];
  }
}

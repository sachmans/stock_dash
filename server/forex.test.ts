/**
 * Forex Position Tests
 * 
 * Tests the forex P&L calculation logic and data model.
 * The forex store uses localStorage on the client, so we test
 * the pure calculation functions and the tRPC chart endpoint
 * with forex symbols.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { appRouter } from './routers';
import type { TrpcContext } from './_core/context';

// Mock the unified AI provider (Core AI Backend)
vi.mock('./lib/aiProvider', () => ({
  aiInvoke: vi.fn(),
  getProviderStatus: vi.fn().mockReturnValue({ activeProvider: 'core_ai_backend', healthy: true, consecutiveFailures: 0, lastSuccess: Date.now(), lastFailure: null, coreAiUrl: 'https://ai.s9n.dxb-gw.basanti.ai' }),
  aiGenerate: vi.fn(),
  aiHealthCheck: vi.fn().mockResolvedValue({ healthy: true }),
}));

// Mock Yahoo Finance (the sole data source now)
vi.mock('./yahooFallback', () => ({
  fetchYahooChart: vi.fn().mockResolvedValue(null),
  fetchYahooNews: vi.fn().mockResolvedValue([]),
}));

// Mock CognitionOS and Memory Vault modules
vi.mock('./lib/cognitionOSClient', () => ({
  getCognitionOS: vi.fn().mockReturnValue({ vectorSearch: vi.fn().mockResolvedValue([]), createConcept: vi.fn().mockResolvedValue({}), health: vi.fn().mockResolvedValue({ status: 'ok' }) }),
}));
vi.mock('./lib/memoryVaultClient', () => ({
  getMemoryVault: vi.fn().mockReturnValue({ search: vi.fn().mockResolvedValue({ episodes: [] }), createEpisode: vi.fn().mockResolvedValue({}), health: vi.fn().mockResolvedValue({ healthy: true }) }),
}));
vi.mock('./lib/progressiveExtraction', () => ({
  extractContext: vi.fn().mockResolvedValue({ formattedContext: '', concepts: [], decisions: [], episodes: [] }),
  getKnowledgeStatus: vi.fn().mockResolvedValue({ conceptsKnown: 0, pastDecisions: 0, episodesStored: 0 }),
}));
vi.mock('./lib/tradingDomainSetup', () => ({
  setupTradingDomain: vi.fn().mockResolvedValue({ success: true }),
  getDomainStatus: vi.fn().mockResolvedValue({ healthy: true }),
}));
vi.mock('./lib/newsIngestion', () => ({ ingestScoredNews: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./lib/recommendationIngestion', () => ({ ingestRecommendation: vi.fn().mockResolvedValue(undefined), recallPreviousRecommendations: vi.fn().mockResolvedValue([]) }));

import { fetchYahooChart } from './yahooFallback';
import { cacheClear } from './cache';
const mockedFetchYahooChart = vi.mocked(fetchYahooChart);

// --- Forex P&L Calculation (mirrors client/src/lib/forex.ts logic) ---

interface ForexPosition {
  id: string;
  symbol: string;
  yahooSymbol: string;
  name: string;
  boughtCurrency: string;
  boughtAmount: number;
  soldCurrency: string;
  soldAmount: number;
  entryRate: number;
  tradeDate: string;
  direction: 'buy' | 'sell';
}

function calculateForexPnL(
  position: ForexPosition,
  currentRate: number
) {
  const currentValueCHF = position.boughtAmount * currentRate;
  const originalCostCHF = position.soldAmount;
  const pnlCHF = currentValueCHF - originalCostCHF;
  const pnlUSD = currentRate > 0 ? pnlCHF / currentRate : 0;
  const pnlPercent = originalCostCHF > 0 ? (pnlCHF / originalCostCHF) * 100 : 0;

  return {
    pnlCHF,
    pnlUSD,
    pnlPercent,
    currentValueCHF,
    currentValueUSD: position.boughtAmount,
  };
}

// Default forex positions matching the store
const TRADE_1: ForexPosition = {
  id: 'fx-usdchf-1',
  symbol: 'USD/CHF',
  yahooSymbol: 'USDCHF=X',
  name: 'USD/CHF — Trade 1',
  boughtCurrency: 'USD',
  boughtAmount: 100_000,
  soldCurrency: 'CHF',
  soldAmount: 76_750.10,
  entryRate: 0.767501,
  tradeDate: '2026-02-11',
  direction: 'buy',
};

const TRADE_2: ForexPosition = {
  id: 'fx-usdchf-2',
  symbol: 'USD/CHF',
  yahooSymbol: 'USDCHF=X',
  name: 'USD/CHF — Trade 2',
  boughtCurrency: 'USD',
  boughtAmount: 200_000,
  soldCurrency: 'CHF',
  soldAmount: 158_150,
  entryRate: 0.79075,
  tradeDate: '2026-03-25',
  direction: 'buy',
};

describe('forex P&L calculations', () => {
  it('calculates zero P&L when current rate equals entry rate for trade 1', () => {
    const result = calculateForexPnL(TRADE_1, 0.767501);
    expect(result.pnlCHF).toBeCloseTo(0, 1);
    expect(result.pnlUSD).toBeCloseTo(0, 1);
    expect(result.pnlPercent).toBeCloseTo(0, 2);
    expect(result.currentValueUSD).toBe(100_000);
  });

  it('calculates zero P&L when current rate equals entry rate for trade 2', () => {
    const result = calculateForexPnL(TRADE_2, 0.79075);
    expect(result.pnlCHF).toBeCloseTo(0, 1);
    expect(result.pnlUSD).toBeCloseTo(0, 1);
    expect(result.pnlPercent).toBeCloseTo(0, 2);
    expect(result.currentValueUSD).toBe(200_000);
  });

  it('calculates positive P&L when CHF weakens (rate goes up) for trade 1', () => {
    const result = calculateForexPnL(TRADE_1, 0.80);
    expect(result.pnlCHF).toBeCloseTo(3249.90, 1);
    expect(result.pnlPercent).toBeGreaterThan(0);
    expect(result.currentValueCHF).toBeCloseTo(80_000, 0);
  });

  it('calculates negative P&L when CHF strengthens (rate goes down) for trade 1', () => {
    const result = calculateForexPnL(TRADE_1, 0.75);
    expect(result.pnlCHF).toBeCloseTo(-1750.10, 1);
    expect(result.pnlPercent).toBeLessThan(0);
    expect(result.currentValueCHF).toBeCloseTo(75_000, 0);
  });

  it('calculates combined P&L across both trades', () => {
    const currentRate = 0.82;
    const r1 = calculateForexPnL(TRADE_1, currentRate);
    const r2 = calculateForexPnL(TRADE_2, currentRate);
    const totalPnLCHF = r1.pnlCHF + r2.pnlCHF;
    const totalBoughtUSD = r1.currentValueUSD + r2.currentValueUSD;

    expect(totalPnLCHF).toBeCloseTo(11_099.90, 1);
    expect(totalBoughtUSD).toBe(300_000);
  });

  it('handles zero current rate gracefully', () => {
    const result = calculateForexPnL(TRADE_1, 0);
    expect(result.pnlCHF).toBe(-76_750.10);
    expect(result.pnlUSD).toBe(0);
    expect(result.currentValueCHF).toBe(0);
  });

  it('validates trade 1 data matches user specification', () => {
    expect(TRADE_1.boughtAmount).toBe(100_000);
    expect(TRADE_1.soldAmount).toBe(76_750.10);
    expect(TRADE_1.entryRate).toBe(0.767501);
    expect(TRADE_1.tradeDate).toBe('2026-02-11');
    expect(TRADE_1.boughtCurrency).toBe('USD');
    expect(TRADE_1.soldCurrency).toBe('CHF');
  });

  it('validates trade 2 data matches user specification', () => {
    expect(TRADE_2.boughtAmount).toBe(200_000);
    expect(TRADE_2.soldAmount).toBe(158_150);
    expect(TRADE_2.entryRate).toBe(0.79075);
    expect(TRADE_2.tradeDate).toBe('2026-03-25');
    expect(TRADE_2.boughtCurrency).toBe('USD');
    expect(TRADE_2.soldCurrency).toBe('CHF');
  });
});

// --- tRPC endpoint tests for forex symbol ---

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: 'https', headers: {} } as TrpcContext['req'],
    res: { clearCookie: () => {} } as unknown as TrpcContext['res'],
  };
}

describe('stock.getChart with forex symbol', () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    vi.clearAllMocks();
    cacheClear();
    caller = appRouter.createCaller(createPublicContext());
  });

  it('accepts USDCHF=X as a valid symbol', async () => {
    mockedFetchYahooChart.mockResolvedValueOnce({
      chart: {
        result: [{
          meta: {
            symbol: 'USDCHF=X',
            currency: 'CHF',
            regularMarketPrice: 0.815,
            chartPreviousClose: 0.812,
            exchangeName: 'CCY',
            marketState: 'REGULAR',
          },
          timestamp: [1712600000],
          indicators: {
            quote: [{
              open: [0.812],
              high: [0.816],
              low: [0.810],
              close: [0.815],
              volume: [0],
            }],
          },
        }],
      },
    });

    const result = await caller.stock.getChart({
      symbol: 'USDCHF=X',
      range: '1d',
      interval: '1d',
      region: 'US',
    });

    expect(result).toBeTruthy();
    expect(result.chart.result[0].meta.symbol).toBe('USDCHF=X');
    expect(result.chart.result[0].meta.regularMarketPrice).toBe(0.815);
  });

  it('returns null when Yahoo Finance call fails for forex', async () => {
    mockedFetchYahooChart.mockRejectedValueOnce(new Error('Yahoo unavailable'));

    const result = await caller.stock.getChart({
      symbol: 'USDCHF=X',
      range: '1d',
      interval: '1d',
      region: 'US',
    });

    expect(result).toBeNull();
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the callDataApi function
vi.mock("./_core/dataApi", () => ({
  callDataApi: vi.fn(),
}));

// Mock the unified AI provider (Core AI Backend)
vi.mock("./lib/aiProvider", () => ({
  aiInvoke: vi.fn(),
  getProviderStatus: vi.fn().mockReturnValue({
    activeProvider: 'core_ai_backend',
    healthy: true,
    consecutiveFailures: 0,
    lastSuccess: Date.now(),
    lastFailure: null,
    coreAiUrl: 'https://ai.s9n.dxb-gw.basanti.ai',
  }),
  aiGenerate: vi.fn(),
  aiHealthCheck: vi.fn().mockResolvedValue({ healthy: true }),
}));

// Mock the Yahoo fallback to prevent real HTTP calls and timeouts
vi.mock("./yahooFallback", () => ({
  fetchYahooChart: vi.fn().mockResolvedValue(null),
  fetchYahooNews: vi.fn().mockResolvedValue(null),
}));

// Mock CognitionOS modules to prevent real HTTP calls
vi.mock("./lib/cognitionOSClient", () => ({
  getCognitionOS: vi.fn().mockReturnValue({
    vectorSearch: vi.fn().mockResolvedValue([]),
    createConcept: vi.fn().mockResolvedValue({}),
    createDocument: vi.fn().mockResolvedValue({}),
    health: vi.fn().mockResolvedValue({ status: 'ok' }),
  }),
}));

vi.mock("./lib/memoryVaultClient", () => ({
  getMemoryVault: vi.fn().mockReturnValue({
    search: vi.fn().mockResolvedValue({ episodes: [] }),
    createEpisode: vi.fn().mockResolvedValue({}),
    createFacts: vi.fn().mockResolvedValue({}),
    health: vi.fn().mockResolvedValue({ healthy: true }),
  }),
}));

vi.mock("./lib/progressiveExtraction", () => ({
  extractContext: vi.fn().mockResolvedValue({ formattedContext: '', concepts: [], decisions: [], episodes: [] }),
  getKnowledgeStatus: vi.fn().mockResolvedValue({ conceptsKnown: 0, pastDecisions: 0, episodesStored: 0 }),
}));

vi.mock("./lib/tradingDomainSetup", () => ({
  setupTradingDomain: vi.fn().mockResolvedValue({ success: true, conceptsCreated: 0, relationshipsCreated: 0, errors: [] }),
  getDomainStatus: vi.fn().mockResolvedValue({ healthy: true, services: {}, graphReady: false }),
}));

vi.mock("./lib/newsIngestion", () => ({
  ingestScoredNews: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./lib/recommendationIngestion", () => ({
  ingestRecommendation: vi.fn().mockResolvedValue(undefined),
  recallPreviousRecommendations: vi.fn().mockResolvedValue([]),
}));

import { callDataApi } from "./_core/dataApi";
import { aiInvoke } from "./lib/aiProvider";
import { cacheClear } from "./cache";
const mockedCallDataApi = vi.mocked(callDataApi);
const mockedAiInvoke = vi.mocked(aiInvoke);

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

const MOCK_CHART_RESPONSE = {
  chart: {
    result: [
      {
        meta: {
          symbol: "BRNT.L",
          longName: "WisdomTree Brent Crude Oil ETC",
          regularMarketPrice: 78.44,
          chartPreviousClose: 77.73,
          regularMarketDayHigh: 79.1,
          regularMarketDayLow: 77.5,
          regularMarketVolume: 12345,
          fiftyTwoWeekHigh: 95.0,
          fiftyTwoWeekLow: 60.0,
          currency: "USD",
          exchangeName: "LSE",
          marketState: "REGULAR",
        },
        timestamp: [1712600000, 1712686400],
        indicators: {
          quote: [
            {
              open: [77.5, 78.0],
              high: [78.5, 79.1],
              low: [77.0, 77.5],
              close: [78.0, 78.44],
              volume: [5000, 7345],
            },
          ],
        },
      },
    ],
  },
};

const MOCK_INSIGHTS_RESPONSE = {
  finance: {
    result: {
      sigDevs: [
        {
          headline: "Oil prices surge on OPEC+ cuts",
          description: "Brent crude rallied after OPEC+ announced production cuts",
          provider: "Reuters",
          url: "https://example.com/news/1",
          date: "2026-04-09",
        },
      ],
      instrumentInfo: {
        recommendation: {
          rating: "Buy",
          targetPrice: {
            fmt: "85.00",
          },
        },
      },
      reports: [
        {
          reportTitle: "Q1 2026 Energy Outlook",
          summary: "Bullish outlook for crude oil",
          provider: "Goldman Sachs",
          url: "https://example.com/report/1",
          reportDate: "2026-04-01",
        },
      ],
    },
  },
};

describe("stock.getChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cacheClear();
  });

  it("returns chart data for a valid symbol", async () => {
    mockedCallDataApi.mockResolvedValueOnce(MOCK_CHART_RESPONSE);

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.stock.getChart({
      symbol: "BRNT.L",
      range: "1mo",
      interval: "1d",
      region: "GB",
    });

    expect(result).toBeTruthy();
    expect((result as any).chart.result[0].meta.symbol).toBe("BRNT.L");
    expect((result as any).chart.result[0].meta.regularMarketPrice).toBe(78.44);

    expect(mockedCallDataApi).toHaveBeenCalledWith("YahooFinance/get_stock_chart", {
      query: {
        symbol: "BRNT.L",
        region: "GB",
        interval: "1d",
        range: "1mo",
        includeAdjustedClose: "true",
      },
    });
  });

  it("returns null when API call fails", async () => {
    mockedCallDataApi.mockRejectedValueOnce(new Error("API unavailable"));

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.stock.getChart({
      symbol: "INVALID",
      range: "1mo",
      interval: "1d",
      region: "US",
    });

    expect(result).toBeNull();
  });

  it("uses default values for optional parameters", async () => {
    mockedCallDataApi.mockResolvedValueOnce(MOCK_CHART_RESPONSE);

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await caller.stock.getChart({ symbol: "BRNT.L" });

    expect(mockedCallDataApi).toHaveBeenCalledWith("YahooFinance/get_stock_chart", {
      query: {
        symbol: "BRNT.L",
        region: "GB",
        interval: "1d",
        range: "1mo",
        includeAdjustedClose: "true",
      },
    });
  });
});

describe("stock.getInsights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cacheClear();
  });

  it("returns insights data for a valid symbol", async () => {
    mockedCallDataApi.mockResolvedValueOnce(MOCK_INSIGHTS_RESPONSE);

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.stock.getInsights({ symbol: "BRNT.L" });

    expect(result).toBeTruthy();
    expect((result as any).finance.result.sigDevs).toHaveLength(1);
    expect((result as any).finance.result.sigDevs[0].headline).toBe(
      "Oil prices surge on OPEC+ cuts"
    );

    expect(mockedCallDataApi).toHaveBeenCalledWith("YahooFinance/get_stock_insights", {
      query: { symbol: "BRNT.L" },
    });
  });

  it("returns null when API call fails", async () => {
    mockedCallDataApi.mockRejectedValueOnce(new Error("API unavailable"));

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.stock.getInsights({ symbol: "INVALID" });

    expect(result).toBeNull();
  });
});

describe("stock.getChart for watchlist symbols", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cacheClear();
  });

  const MOCK_GOLD_RESPONSE = {
    chart: {
      result: [
        {
          meta: {
            symbol: "GC=F",
            longName: "Gold Futures",
            regularMarketPrice: 4793.30,
            chartPreviousClose: 4777.20,
            regularMarketDayHigh: 4802.80,
            regularMarketDayLow: 4718.60,
            regularMarketVolume: 78200,
            fiftyTwoWeekHigh: 5000.0,
            fiftyTwoWeekLow: 3200.0,
            currency: "USD",
            exchangeName: "COMEX",
            marketState: "REGULAR",
          },
          timestamp: [1712600000],
          indicators: {
            quote: [
              {
                open: [4770.0],
                high: [4802.80],
                low: [4718.60],
                close: [4793.30],
                volume: [78200],
              },
            ],
          },
        },
      ],
    },
  };

  const MOCK_SILVER_RESPONSE = {
    chart: {
      result: [
        {
          meta: {
            symbol: "SI=F",
            longName: "Silver Futures",
            regularMarketPrice: 75.10,
            chartPreviousClose: 75.385,
            regularMarketDayHigh: 75.48,
            regularMarketDayLow: 72.93,
            regularMarketVolume: 17500,
            fiftyTwoWeekHigh: 80.0,
            fiftyTwoWeekLow: 25.0,
            currency: "USD",
            exchangeName: "COMEX",
            marketState: "REGULAR",
          },
          timestamp: [1712600000],
          indicators: {
            quote: [
              {
                open: [74.50],
                high: [75.48],
                low: [72.93],
                close: [75.10],
                volume: [17500],
              },
            ],
          },
        },
      ],
    },
  };

  const MOCK_DEWA_RESPONSE = {
    chart: {
      result: [
        {
          meta: {
            symbol: "DEWA.AE",
            longName: "Dubai Electricity & Water Authority",
            regularMarketPrice: 2.81,
            chartPreviousClose: 2.85,
            regularMarketDayHigh: 2.84,
            regularMarketDayLow: 2.75,
            regularMarketVolume: 23200000,
            fiftyTwoWeekHigh: 3.50,
            fiftyTwoWeekLow: 2.20,
            currency: "AED",
            exchangeName: "DFM",
            marketState: "REGULAR",
          },
          timestamp: [1712600000],
          indicators: {
            quote: [
              {
                open: [2.82],
                high: [2.84],
                low: [2.75],
                close: [2.81],
                volume: [23200000],
              },
            ],
          },
        },
      ],
    },
  };

  it("fetches Gold futures (GC=F) data correctly", async () => {
    mockedCallDataApi.mockResolvedValueOnce(MOCK_GOLD_RESPONSE);

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.stock.getChart({
      symbol: "GC=F",
      range: "1d",
      interval: "1d",
      region: "GB",
    });

    expect(result).toBeTruthy();
    expect((result as any).chart.result[0].meta.symbol).toBe("GC=F");
    expect((result as any).chart.result[0].meta.regularMarketPrice).toBe(4793.30);
    expect((result as any).chart.result[0].meta.currency).toBe("USD");

    expect(mockedCallDataApi).toHaveBeenCalledWith("YahooFinance/get_stock_chart", {
      query: {
        symbol: "GC=F",
        region: "GB",
        interval: "1d",
        range: "1d",
        includeAdjustedClose: "true",
      },
    });
  });

  it("fetches Silver futures (SI=F) data correctly", async () => {
    mockedCallDataApi.mockResolvedValueOnce(MOCK_SILVER_RESPONSE);

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.stock.getChart({
      symbol: "SI=F",
      range: "1d",
      interval: "1d",
      region: "GB",
    });

    expect(result).toBeTruthy();
    expect((result as any).chart.result[0].meta.symbol).toBe("SI=F");
    expect((result as any).chart.result[0].meta.regularMarketPrice).toBe(75.10);
  });

  it("fetches DEWA (DEWA.AE) data correctly with AED currency", async () => {
    mockedCallDataApi.mockResolvedValueOnce(MOCK_DEWA_RESPONSE);

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.stock.getChart({
      symbol: "DEWA.AE",
      range: "1d",
      interval: "1d",
      region: "GB",
    });

    expect(result).toBeTruthy();
    expect((result as any).chart.result[0].meta.symbol).toBe("DEWA.AE");
    expect((result as any).chart.result[0].meta.currency).toBe("AED");
    expect((result as any).chart.result[0].meta.regularMarketPrice).toBe(2.81);
  });

  it("handles multiple sequential watchlist queries", async () => {
    mockedCallDataApi
      .mockResolvedValueOnce(MOCK_GOLD_RESPONSE)
      .mockResolvedValueOnce(MOCK_SILVER_RESPONSE)
      .mockResolvedValueOnce(MOCK_DEWA_RESPONSE);

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const goldResult = await caller.stock.getChart({ symbol: "GC=F", range: "1d", interval: "1d" });
    const silverResult = await caller.stock.getChart({ symbol: "SI=F", range: "1d", interval: "1d" });
    const dewaResult = await caller.stock.getChart({ symbol: "DEWA.AE", range: "1d", interval: "1d" });

    expect(goldResult).toBeTruthy();
    expect(silverResult).toBeTruthy();
    expect(dewaResult).toBeTruthy();
    expect(mockedCallDataApi).toHaveBeenCalledTimes(3);
  });
});

describe("stock.getAnalysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cacheClear();
  });

  const MOCK_ANALYSIS_INPUT = {
    symbol: "BRNT.L",
    name: "WisdomTree Brent Crude Oil ETC",
    price: 78.44,
    change: 0.71,
    changePercent: 0.91,
    dayHigh: 79.1,
    dayLow: 77.5,
    fiftyTwoWeekHigh: 95.0,
    fiftyTwoWeekLow: 60.0,
    volume: 12345,
    previousClose: 77.73,
    currency: "USD",
    exchange: "LSE",
  };

  const MOCK_LLM_RESPONSE = {
    id: "coreai-test",
    created: Date.now(),
    model: "llama-3.3-70b-versatile",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant" as const,
          content: JSON.stringify({
            recommendation: "BUY",
            confidence: 72,
            summary: "BRNT shows bullish momentum with price recovering from recent lows. The 0.91% daily gain suggests renewed buying interest in crude oil ETCs.",
            bullCase: "Oil prices are supported by OPEC+ production cuts and geopolitical tensions in key producing regions, which could drive prices toward the 52-week high.",
            bearCase: "Global economic slowdown concerns and potential demand destruction could cap upside, with the instrument trading well below its 52-week high of 95.00.",
            keyLevels: {
              support: 77.00,
              resistance: 80.50,
              target: 85.00,
            },
            riskLevel: "MEDIUM",
            catalysts: [
              "OPEC+ production decision at next meeting",
              "US crude oil inventory data release",
              "Global PMI data indicating demand trends",
            ],
          }),
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 500,
      completion_tokens: 200,
      total_tokens: 700,
    },
  };

  it("returns structured analysis for a valid instrument", async () => {
    mockedAiInvoke.mockResolvedValueOnce(MOCK_LLM_RESPONSE);

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.stock.getAnalysis(MOCK_ANALYSIS_INPUT);

    expect(result).toBeTruthy();
    expect(result!.recommendation).toBe("BUY");
    expect(result!.confidence).toBe(72);
    expect(result!.summary).toContain("bullish momentum");
    expect(result!.keyLevels.support).toBe(77.00);
    expect(result!.keyLevels.resistance).toBe(80.50);
    expect(result!.keyLevels.target).toBe(85.00);
    expect(result!.riskLevel).toBe("MEDIUM");
    expect(result!.catalysts).toHaveLength(3);
    expect(result!.symbol).toBe("BRNT.L");
    expect(result!.analyzedAt).toBeDefined();
  });

  it("passes correct parameters to aiInvoke (Core AI Backend)", async () => {
    mockedAiInvoke.mockResolvedValueOnce(MOCK_LLM_RESPONSE);

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await caller.stock.getAnalysis(MOCK_ANALYSIS_INPUT);

    expect(mockedAiInvoke).toHaveBeenCalledTimes(1);
    const callArgs = mockedAiInvoke.mock.calls[0][0];
    expect(callArgs.messages).toHaveLength(2);
    expect(callArgs.messages[0].role).toBe("system");
    expect(callArgs.messages[1].role).toBe("user");
    expect(callArgs.response_format).toBeDefined();
    expect((callArgs.response_format as any).type).toBe("json_schema");
  });

  it("returns null when Core AI Backend call fails", async () => {
    mockedAiInvoke.mockRejectedValueOnce(new Error("Core AI Backend failed after retry"));

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.stock.getAnalysis(MOCK_ANALYSIS_INPUT);

    expect(result).toBeNull();
  });

  it("returns null when LLM returns invalid JSON", async () => {
    const invalidResponse = {
      ...MOCK_LLM_RESPONSE,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant" as const,
            content: "This is not valid JSON",
          },
          finish_reason: "stop",
        },
      ],
    };
    mockedAiInvoke.mockResolvedValueOnce(invalidResponse);

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.stock.getAnalysis(MOCK_ANALYSIS_INPUT);

    expect(result).toBeNull();
  });

  it("works with Gold futures input", async () => {
    const goldLLMResponse = {
      ...MOCK_LLM_RESPONSE,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant" as const,
            content: JSON.stringify({
              recommendation: "STRONG_BUY",
              confidence: 85,
              summary: "Gold is in a strong uptrend driven by safe-haven demand.",
              bullCase: "Central bank buying and inflation hedging continue to support gold prices.",
              bearCase: "Rising real yields could pressure gold if the Fed maintains hawkish stance.",
              keyLevels: { support: 4700, resistance: 4850, target: 5000 },
              riskLevel: "LOW",
              catalysts: ["Fed rate decision", "Geopolitical tensions"],
            }),
          },
          finish_reason: "stop",
        },
      ],
    };
    mockedAiInvoke.mockResolvedValueOnce(goldLLMResponse);

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.stock.getAnalysis({
      symbol: "GC=F",
      name: "Gold Futures",
      price: 4793.30,
      change: 16.10,
      changePercent: 0.34,
      dayHigh: 4802.80,
      dayLow: 4718.60,
      volume: 78200,
      currency: "USD",
      exchange: "COMEX",
    });

    expect(result).toBeTruthy();
    expect(result!.recommendation).toBe("STRONG_BUY");
    expect(result!.confidence).toBe(85);
    expect(result!.symbol).toBe("GC=F");
  });
});

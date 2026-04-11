import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/* ─── Core AI Backend Tests ─── */

describe("coreAiBackend", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("isCoreAiBackendConfigured returns false when env vars missing", async () => {
    process.env.CORE_AI_BACKEND_URL = "";
    process.env.CORE_AI_BACKEND_API_KEY = "";
    // Re-import to pick up env
    const mod = await import("./lib/coreAiBackend");
    expect(mod.isCoreAiBackendConfigured()).toBe(false);
  });

  it("isCoreAiBackendConfigured returns true when env vars set", async () => {
    process.env.CORE_AI_BACKEND_URL = "https://ai.test.example.com";
    process.env.CORE_AI_BACKEND_API_KEY = "sk_test_123";
    const mod = await import("./lib/coreAiBackend");
    expect(mod.isCoreAiBackendConfigured()).toBe(true);
  });

  it("coreAiChatCompletion throws when not configured", async () => {
    process.env.CORE_AI_BACKEND_URL = "";
    process.env.CORE_AI_BACKEND_API_KEY = "";
    const mod = await import("./lib/coreAiBackend");
    await expect(
      mod.coreAiChatCompletion({
        messages: [{ role: "user", content: "test" }],
      }),
    ).rejects.toThrow("Core AI Backend not configured");
  });

  it("coreAiChatCompletion calls correct URL with auth header", async () => {
    process.env.CORE_AI_BACKEND_URL = "https://ai.test.example.com";
    process.env.CORE_AI_BACKEND_API_KEY = "sk_test_key";

    const mockResponse = {
      id: "chatcmpl-123",
      model: "default",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Hello from Core AI" },
          finish_reason: "stop",
        },
      ],
    };

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const mod = await import("./lib/coreAiBackend");
    const result = await mod.coreAiChatCompletion({
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.choices[0].message.content).toBe("Hello from Core AI");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://ai.test.example.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk_test_key",
        }),
      }),
    );
  });

  it("coreAiChatCompletion throws on non-OK response", async () => {
    process.env.CORE_AI_BACKEND_URL = "https://ai.test.example.com";
    process.env.CORE_AI_BACKEND_API_KEY = "sk_test_key";

    (globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "Server error details",
    });

    const mod = await import("./lib/coreAiBackend");
    await expect(
      mod.coreAiChatCompletion({
        messages: [{ role: "user", content: "test" }],
      }),
    ).rejects.toThrow("Core AI Backend request failed (500 Internal Server Error)");
  });

  it("coreAiHealthCheck returns unavailable when URL not set", async () => {
    process.env.CORE_AI_BACKEND_URL = "";
    const mod = await import("./lib/coreAiBackend");
    const result = await mod.coreAiHealthCheck();
    expect(result.available).toBe(false);
    expect(result.error).toContain("not set");
  });

  it("storeMemoryEpisode returns false when not configured", async () => {
    process.env.CORE_AI_BACKEND_URL = "";
    process.env.CORE_AI_BACKEND_API_KEY = "";
    const mod = await import("./lib/coreAiBackend");
    const result = await mod.storeMemoryEpisode("app1", "user1", "test content");
    expect(result).toBe(false);
  });
});

/* ─── CognitionOS Tests ─── */

describe("cognitionOS", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("isCognitionOSConfigured returns false when env vars missing", async () => {
    process.env.COGNITION_OS_URL = "";
    process.env.COGNITION_OS_TENANT_ID = "";
    const mod = await import("./lib/cognitionOS");
    expect(mod.isCognitionOSConfigured()).toBe(false);
  });

  it("isCognitionOSConfigured returns true when env vars set", async () => {
    process.env.COGNITION_OS_URL = "https://cognition.test.example.com";
    process.env.COGNITION_OS_TENANT_ID = "tenant-123";
    const mod = await import("./lib/cognitionOS");
    expect(mod.isCognitionOSConfigured()).toBe(true);
  });

  it("storeConcept returns null when not configured", async () => {
    process.env.COGNITION_OS_URL = "";
    process.env.COGNITION_OS_TENANT_ID = "";
    const mod = await import("./lib/cognitionOS");
    const result = await mod.storeConcept({
      name: "BRNT",
      type: "portfolio_position",
    });
    expect(result).toBeNull();
  });

  it("storeConcept sends correct request when configured", async () => {
    process.env.COGNITION_OS_URL = "https://cognition.test.example.com";
    process.env.COGNITION_OS_TENANT_ID = "tenant-123";

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "concept-456" }),
    });

    const mod = await import("./lib/cognitionOS");
    const result = await mod.storeConcept({
      name: "BRNT",
      type: "portfolio_position",
      description: "Brent Crude Oil position",
    });

    expect(result).toBe("concept-456");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://cognition.test.example.com/api/v1/concepts",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-Tenant-ID": "tenant-123",
        }),
      }),
    );
  });

  it("queryConcepts returns empty when not configured", async () => {
    process.env.COGNITION_OS_URL = "";
    process.env.COGNITION_OS_TENANT_ID = "";
    const mod = await import("./lib/cognitionOS");
    const result = await mod.queryConcepts("BRNT");
    expect(result.concepts).toEqual([]);
    expect(result.totalCount).toBe(0);
  });

  it("getKnowledgeContext returns empty context when not configured", async () => {
    process.env.COGNITION_OS_URL = "";
    process.env.COGNITION_OS_TENANT_ID = "";
    const mod = await import("./lib/cognitionOS");
    const result = await mod.getKnowledgeContext("BRNT");
    expect(result.relatedConcepts).toEqual([]);
    expect(result.summary).toBe("");
    expect(result.confidence).toBe(0);
  });

  it("syncPortfolioConcept builds correct concept payload", async () => {
    process.env.COGNITION_OS_URL = "https://cognition.test.example.com";
    process.env.COGNITION_OS_TENANT_ID = "tenant-123";

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "pos-789" }),
    });

    const mod = await import("./lib/cognitionOS");
    await mod.syncPortfolioConcept({
      symbol: "BRNT",
      name: "Brent Crude Oil",
      quantity: 250,
      entryPrice: 78.66,
      type: "commodity",
    });

    const callArgs = (globalThis.fetch as any).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.name).toBe("BRNT");
    expect(body.type).toBe("portfolio_position");
    expect(body.properties.quantity).toBe(250);
    expect(body.properties.entryPrice).toBe(78.66);
  });

  it("cognitionOSHealthCheck returns unavailable when URL not set", async () => {
    process.env.COGNITION_OS_URL = "";
    const mod = await import("./lib/cognitionOS");
    const result = await mod.cognitionOSHealthCheck();
    expect(result.available).toBe(false);
  });
});

/* ─── AI Provider Fallback Tests ─── */

describe("aiProvider", () => {
  it("getProviderStatus returns correct structure", async () => {
    process.env.CORE_AI_BACKEND_URL = "";
    process.env.CORE_AI_BACKEND_API_KEY = "";
    process.env.COGNITION_OS_URL = "";
    process.env.COGNITION_OS_TENANT_ID = "";

    const mod = await import("./lib/aiProvider");
    const status = mod.getProviderStatus();

    expect(status).toHaveProperty("coreAiBackend");
    expect(status).toHaveProperty("cognitionOS");
    expect(status).toHaveProperty("manusForge");
    expect(status.coreAiBackend).toHaveProperty("configured");
    expect(status.coreAiBackend).toHaveProperty("circuitOpen");
    expect(status.coreAiBackend).toHaveProperty("failCount");
    expect(status.manusForge.configured).toBe(true);
  });

  it("getProviderStatus reflects configured state", async () => {
    process.env.CORE_AI_BACKEND_URL = "https://ai.test.example.com";
    process.env.CORE_AI_BACKEND_API_KEY = "sk_test";
    process.env.COGNITION_OS_URL = "https://cognition.test.example.com";
    process.env.COGNITION_OS_TENANT_ID = "tenant-123";

    const mod = await import("./lib/aiProvider");
    const status = mod.getProviderStatus();

    expect(status.coreAiBackend.configured).toBe(true);
    expect(status.cognitionOS.configured).toBe(true);
  });
});

/* ─── Database Dialect Detection Tests ─── */

describe("db dialect detection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("detects postgresql from DATABASE_URL", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/stockdb";
    process.env.DB_DIALECT = "";
    const mod = await import("./db");
    expect(mod.detectDialect()).toBe("postgresql");
  });

  it("detects postgresql from postgres:// prefix", async () => {
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/stockdb";
    process.env.DB_DIALECT = "";
    const mod = await import("./db");
    expect(mod.detectDialect()).toBe("postgresql");
  });

  it("detects mysql from mysql:// prefix", async () => {
    process.env.DATABASE_URL = "mysql://user:pass@localhost:3306/stockdb";
    process.env.DB_DIALECT = "";
    const mod = await import("./db");
    expect(mod.detectDialect()).toBe("mysql");
  });

  it("defaults to mysql when no prefix match", async () => {
    process.env.DATABASE_URL = "tidb://user:pass@localhost:4000/stockdb";
    process.env.DB_DIALECT = "";
    const mod = await import("./db");
    expect(mod.detectDialect()).toBe("mysql");
  });

  it("respects explicit DB_DIALECT=postgresql", async () => {
    process.env.DATABASE_URL = "mysql://user:pass@localhost:3306/stockdb";
    process.env.DB_DIALECT = "postgresql";
    const mod = await import("./db");
    expect(mod.detectDialect()).toBe("postgresql");
  });

  it("respects explicit DB_DIALECT=mysql", async () => {
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/stockdb";
    process.env.DB_DIALECT = "mysql";
    const mod = await import("./db");
    expect(mod.detectDialect()).toBe("mysql");
  });
});

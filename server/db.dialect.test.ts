import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for db.ts dual-dialect detection.
 * We test the detectDialect logic by dynamically importing db.ts with different DATABASE_URL values.
 * Since DB_DIALECT is computed at module load time, we need to reset the module for each test.
 */

describe("DB Dialect Detection", () => {
  const originalEnv = process.env.DATABASE_URL;

  afterEach(() => {
    // Restore original env
    if (originalEnv !== undefined) {
      process.env.DATABASE_URL = originalEnv;
    } else {
      delete process.env.DATABASE_URL;
    }
    // Reset module cache so DB_DIALECT is re-evaluated
    vi.resetModules();
  });

  it("detects postgresql from postgresql:// URL", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/stockdash";
    vi.resetModules();
    const { DB_DIALECT } = await import("./db");
    expect(DB_DIALECT).toBe("postgresql");
  });

  it("detects postgresql from postgres:// URL (short form)", async () => {
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/stockdash";
    vi.resetModules();
    const { DB_DIALECT } = await import("./db");
    expect(DB_DIALECT).toBe("postgresql");
  });

  it("detects mysql from mysql:// URL", async () => {
    process.env.DATABASE_URL = "mysql://user:pass@localhost:3306/stockdash";
    vi.resetModules();
    const { DB_DIALECT } = await import("./db");
    expect(DB_DIALECT).toBe("mysql");
  });

  it("defaults to mysql when DATABASE_URL is not set", async () => {
    delete process.env.DATABASE_URL;
    vi.resetModules();
    const { DB_DIALECT } = await import("./db");
    expect(DB_DIALECT).toBe("mysql");
  });

  it("defaults to mysql for unknown URL prefix", async () => {
    process.env.DATABASE_URL = "sqlite:///tmp/test.db";
    vi.resetModules();
    const { DB_DIALECT } = await import("./db");
    expect(DB_DIALECT).toBe("mysql");
  });

  it("getDb returns null when DATABASE_URL is not set", async () => {
    delete process.env.DATABASE_URL;
    vi.resetModules();
    const { getDb } = await import("./db");
    const db = await getDb();
    expect(db).toBeNull();
  });
});

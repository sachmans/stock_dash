import { eq } from "drizzle-orm";

/* ─── Dialect Detection ─────────────────────────────────────────────── */

type Dialect = "mysql" | "postgresql";

function detectDialect(): Dialect {
  const url = process.env.DATABASE_URL ?? "";
  if (url.startsWith("postgresql://") || url.startsWith("postgres://")) {
    return "postgresql";
  }
  return "mysql"; // default for Manus hosting
}

export const DB_DIALECT: Dialect = detectDialect();

/* ─── Lazy DB Instance ──────────────────────────────────────────────── */

let _db: any = null;

export async function getDb() {
  if (_db) return _db;
  if (!process.env.DATABASE_URL) return null;

  try {
    if (DB_DIALECT === "postgresql") {
      const { drizzle } = await import("drizzle-orm/node-postgres");
      _db = drizzle(process.env.DATABASE_URL);
    } else {
      const { drizzle } = await import("drizzle-orm/mysql2");
      _db = drizzle(process.env.DATABASE_URL);
    }
  } catch (error) {
    console.warn("[Database] Failed to connect:", error);
    _db = null;
  }
  return _db;
}

/* ─── Schema Helpers ────────────────────────────────────────────────── */

async function getSchema() {
  if (DB_DIALECT === "postgresql") {
    return await import("../drizzle/schema-pg");
  }
  return await import("../drizzle/schema");
}

/* ─── User Operations ───────────────────────────────────────────────── */

export type InsertUser = {
  openId: string;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  role?: "user" | "admin";
  lastSignedIn?: Date;
};

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  const schema = await getSchema();

  try {
    const values: Record<string, unknown> = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (process.env.ADMIN_EMAIL && user.openId === process.env.ADMIN_EMAIL) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    if (DB_DIALECT === "postgresql") {
      // PostgreSQL: ON CONFLICT DO UPDATE
      await db
        .insert(schema.users)
        .values(values)
        .onConflictDoUpdate({
          target: schema.users.openId,
          set: updateSet,
        });
    } else {
      // MySQL: ON DUPLICATE KEY UPDATE
      await db
        .insert(schema.users)
        .values(values)
        .onDuplicateKeyUpdate({
          set: updateSet,
        });
    }
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const schema = await getSchema();
  const result = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.openId, openId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// TODO: add feature queries here as your schema grows.

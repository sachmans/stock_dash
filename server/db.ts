import { eq } from "drizzle-orm";
import { ENV } from './_core/env';

/* ─── Dialect Detection ─── */

export type DbDialect = 'mysql' | 'postgresql';

/**
 * Detect database dialect from DATABASE_URL or explicit DB_DIALECT env var.
 * - postgres://, postgresql:// → 'postgresql'
 * - mysql://, mysql2://, tidb://, everything else → 'mysql'
 */
export function detectDialect(): DbDialect {
  // Read directly from process.env so runtime changes are picked up
  const dialect = process.env.DB_DIALECT || '';
  if (dialect === 'postgresql' || dialect === 'postgres') return 'postgresql';
  if (dialect === 'mysql') return 'mysql';

  const url = process.env.DATABASE_URL || '';
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) return 'postgresql';
  return 'mysql'; // default
}

/* ─── Lazy DB Singleton ─── */

let _db: any = null;
let _dialect: DbDialect | null = null;
let _users: any = null;

async function initDb() {
  const dialect = detectDialect();
  _dialect = dialect;

  if (dialect === 'postgresql') {
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { users } = await import('../drizzle/schema-pg');
    _users = users;
    _db = drizzle(process.env.DATABASE_URL!);
  } else {
    const { drizzle } = await import('drizzle-orm/mysql2');
    const { users } = await import('../drizzle/schema');
    _users = users;
    _db = drizzle(process.env.DATABASE_URL!);
  }
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      await initDb();
      console.log(`[Database] Connected with ${_dialect} dialect`);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export function getDialect(): DbDialect {
  if (!_dialect) _dialect = detectDialect();
  return _dialect;
}

/* ─── Schema-agnostic helpers ─── */

// Re-export types from the appropriate schema
type InsertUser = {
  openId: string;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  role?: 'user' | 'admin';
  lastSignedIn?: Date;
};

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db || !_users) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: Record<string, unknown> = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    for (const field of textFields) {
      const value = user[field];
      if (value === undefined) continue;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    }

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    const dialect = getDialect();

    if (dialect === 'postgresql') {
      // PostgreSQL: ON CONFLICT DO UPDATE
      await db.insert(_users).values(values).onConflictDoUpdate({
        target: _users.openId,
        set: updateSet,
      });
    } else {
      // MySQL: ON DUPLICATE KEY UPDATE
      await db.insert(_users).values(values).onDuplicateKeyUpdate({
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
  if (!db || !_users) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(_users).where(eq(_users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// TODO: add feature queries here as your schema grows.

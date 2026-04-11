import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

/**
 * Detect dialect from DATABASE_URL or explicit DB_DIALECT env var.
 * Supports both MySQL (TiDB) and PostgreSQL.
 */
function detectDialect(): "mysql" | "postgresql" {
  const explicit = process.env.DB_DIALECT;
  if (explicit === "postgresql" || explicit === "postgres") return "postgresql";
  if (explicit === "mysql") return "mysql";

  if (connectionString!.startsWith("postgres://") || connectionString!.startsWith("postgresql://")) {
    return "postgresql";
  }
  return "mysql";
}

const dialect = detectDialect();
const schemaPath = dialect === "postgresql" ? "./drizzle/schema-pg.ts" : "./drizzle/schema.ts";

console.log(`[Drizzle] Using ${dialect} dialect with schema: ${schemaPath}`);

export default defineConfig({
  schema: schemaPath,
  out: "./drizzle",
  dialect,
  dbCredentials: {
    url: connectionString,
  },
});

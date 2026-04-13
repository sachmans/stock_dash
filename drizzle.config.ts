import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

const isPostgres =
  connectionString.startsWith("postgresql://") ||
  connectionString.startsWith("postgres://");

export default defineConfig({
  schema: isPostgres ? "./drizzle/schema-pg.ts" : "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: isPostgres ? "postgresql" : "mysql",
  dbCredentials: {
    url: connectionString,
  },
});

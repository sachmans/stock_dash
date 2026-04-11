export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",

  // Core AI Backend (SeKondBrain) — primary LLM provider
  coreAiBackendUrl: process.env.CORE_AI_BACKEND_URL ?? "",
  coreAiBackendApiKey: process.env.CORE_AI_BACKEND_API_KEY ?? "",

  // CognitionOS — knowledge graph
  cognitionOsUrl: process.env.COGNITION_OS_URL ?? "",
  cognitionOsTenantId: process.env.COGNITION_OS_TENANT_ID ?? "",

  // Database dialect — auto-detected from DATABASE_URL if not set
  // Explicit values: 'mysql' | 'postgresql'
  dbDialect: process.env.DB_DIALECT ?? "",
};

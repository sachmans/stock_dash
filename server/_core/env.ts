export const ENV = {
  // Standalone auth
  cookieSecret: process.env.JWT_SECRET ?? "change-me-in-production",
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",

  // Core AI Backend (sole LLM provider)
  coreAiBackendUrl: process.env.CORE_AI_BACKEND_URL ?? "https://ai.s9n.dxb-gw.basanti.ai",

  // CognitionOS knowledge graph
  cognitionOsUrl: process.env.COGNITION_OS_URL ?? "https://cognition.s9n.dxb-gw.basanti.ai",
  cognitionOsTenantId: process.env.COGNITION_OS_TENANT_ID ?? "stock_dash",
  cognitionOsGraphName: process.env.COGNITION_OS_GRAPH_NAME ?? "stock_trading",

  // Memory Vault (via Core AI Backend)
  memoryVaultUrl: process.env.MEMORY_VAULT_URL ?? "https://ai.s9n.dxb-gw.basanti.ai/v1/memory",
};

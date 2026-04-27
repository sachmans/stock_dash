# StockDash — Claude Runner Deployment Prompt

Use this prompt when deploying StockDash on a self-hosted runner with Claude.

---

## System Context

You are deploying **StockDash**, a standalone stock portfolio tracker with AI-powered analysis. The app has **zero Manus platform dependencies** — all AI goes through the S9N Core AI Backend infrastructure.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  StockDash (Node.js 22 + React 19)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │ Vite SPA │  │ Express  │  │ tRPC API             │  │
│  │ (React)  │──│ Server   │──│ stock.* procedures   │  │
│  └──────────┘  └──────────┘  └──────────────────────┘  │
└─────────┬──────────┬──────────────┬────────────────┬────┘
          │          │              │                │
    ┌─────▼─────┐ ┌──▼───────┐ ┌───▼──────────┐ ┌──▼──────────┐
    │ MySQL 8.0 │ │ Core AI  │ │ CognitionOS  │ │ Memory Vault│
    │ (local)   │ │ Backend  │ │ (Knowledge   │ │ (Agentic    │
    │           │ │ (LLM)   │ │  Graph)      │ │  Memory)    │
    └───────────┘ └──────────┘ └──────────────┘ └─────────────┘
```

## External Services (S9N Infrastructure)

| Service | URL | Auth | Purpose |
|---|---|---|---|
| Core AI Backend | `https://ai.s9n.dxb-gw.basanti.ai` | None for `/v1/chat` | LLM completions (llamacpp → Groq fallback) |
| CognitionOS | `https://cognition.s9n.dxb-gw.basanti.ai` | None | Knowledge graph (concepts, documents, vectors) |
| Memory Vault | `https://ai.s9n.dxb-gw.basanti.ai/v1/memory` | None | Episode + fact storage for agentic recall |

## Model Routing

The app sends all LLM requests to Core AI Backend's `/v1/chat` endpoint. The backend routes to:

1. **Primary**: `llamacpp_ip` provider — local Llama 3.3 / Gemma / Qwen running on the S9N infrastructure (no API key, fastest)
2. **Fallback**: `groq` provider — Groq-hosted open-source models (fast cloud inference)

The app does **not** hardcode model names. The Core AI Backend's `config_resolver` handles model selection based on the provider.

## Skill-Based Prompt Management

All AI prompts are defined in `server/lib/skills.yaml` and loaded at runtime by `server/lib/skillLoader.ts`. The skill-aware provider (`server/lib/skillAwareProvider.ts`) executes them in two modes:

1. **Remote**: If `CORE_AI_BACKEND_JWT` is set, tries `/v1/skills/run-by-name` for centrally managed prompts
2. **Local**: Falls back to rendering prompts from `skills.yaml` and calling `/v1/chat` directly (no auth needed)

### Registered Skills (8 total)

| Skill Name | Purpose | Model Tier |
|---|---|---|
| `stockdash.financial_analysis` | Single-agent stock analysis with structured JSON output | balanced |
| `stockdash.agent_technical` | Technical analysis agent (multi-agent debate) | balanced |
| `stockdash.agent_fundamental` | Fundamental analysis agent (multi-agent debate) | balanced |
| `stockdash.agent_sentiment` | Sentiment analysis agent (multi-agent debate) | balanced |
| `stockdash.agent_risk` | Risk assessment agent (multi-agent debate) | balanced |
| `stockdash.agent_moderator` | Multi-agent moderator/synthesizer | capable |
| `stockdash.sentiment_scorer` | News article sentiment scoring (batch) | fast |
| `stockdash.kora_chat` | Kora AI trading assistant chat | balanced |

### Optional: Register Skills on Core AI Backend

```bash
# If you have a JWT for the Core AI Backend:
CORE_AI_BACKEND_URL=https://ai.s9n.dxb-gw.basanti.ai \
CORE_AI_BACKEND_JWT=<your-jwt> \
node scripts/register-skills.mjs

# If no JWT, skills run locally via skills.yaml — this is fine for all use cases.
```

---

## Deployment Steps

### 1. Clone and Setup

```bash
gh repo clone sachmans/stock_dash
cd stock_dash
git checkout main  # Standalone branch (no Manus deps)
```

### 2. Create Environment File

```bash
cat > .env << 'EOF'
# Database (MySQL)
DATABASE_URL=mysql://stockdash:stockdash_local_2024@db:3306/stockdash

# Auth
JWT_SECRET=<generate-a-random-32-char-string>

# Core AI Backend (LLM) — llamacpp primary, Groq fallback
CORE_AI_BACKEND_URL=https://ai.s9n.dxb-gw.basanti.ai

# CognitionOS (Knowledge Graph)
COGNITION_OS_URL=https://cognition.s9n.dxb-gw.basanti.ai
COGNITION_OS_TENANT_ID=stock_dash
COGNITION_OS_GRAPH_NAME=stock_trading

# Memory Vault (Agentic Memory)
MEMORY_VAULT_URL=https://ai.s9n.dxb-gw.basanti.ai/v1/memory

# Server
PORT=3000
NODE_ENV=production
EOF
```

### 3. Deploy with Docker Compose

```bash
docker compose up -d --build
```

This starts:
- **MySQL 8.0** on port 3306 (with persistent volume)
- **StockDash app** on port 3000

### 4. Run Database Migrations

```bash
# Option A: Inside the running container
docker compose exec app npx drizzle-kit generate
docker compose exec app npx drizzle-kit migrate

# Option B: Locally with DATABASE_URL pointing to the container's MySQL
DATABASE_URL=mysql://stockdash:stockdash_local_2024@localhost:3306/stockdash \
pnpm db:push
```

### 5. Setup Trading Domain (CognitionOS Seed Graph)

After the app is running, call the domain setup endpoint:

```bash
curl -X POST http://localhost:3000/api/trpc/stock.setupDomain \
  -H "Content-Type: application/json" \
  -d '{"json":{}}'
```

This creates:
- Tenant `stock_dash` on CognitionOS
- SuperRoot node for the trading domain
- Market hierarchy: Market → Equities/Forex/Commodities → individual instruments

### 6. Verify

```bash
# Health check
curl http://localhost:3000/api/trpc/stock.getProviderStatus

# Should return:
# { "result": { "data": { "json": { "coreAi": { "available": true }, "cognitionOS": { "available": true } } } } }
```

### 7. Optional: Register Skills Remotely

```bash
# Only needed if you want centrally managed prompts on Core AI Backend
CORE_AI_BACKEND_JWT=<jwt> node scripts/register-skills.mjs
```

---

## Development (Without Docker)

```bash
# Install dependencies
pnpm install

# Set DATABASE_URL to a local MySQL instance
export DATABASE_URL=mysql://user:pass@localhost:3306/stockdash
export JWT_SECRET=dev-secret-change-in-prod
export CORE_AI_BACKEND_URL=https://ai.s9n.dxb-gw.basanti.ai
export COGNITION_OS_URL=https://cognition.s9n.dxb-gw.basanti.ai

# Run migrations
pnpm db:push

# Start dev server (hot reload)
pnpm dev

# Run tests
pnpm test
```

---

## Data Sources

| Data | Source | API Key Required? |
|---|---|---|
| Stock prices, OHLCV, charts | Yahoo Finance (direct) | No |
| Forex rates | Yahoo Finance (direct) | No |
| News articles | Yahoo Finance RSS | No |
| Technical indicators (RSI, MACD, SMA, BB) | Computed server-side from Yahoo data | No |
| AI analysis & recommendations | Core AI Backend `/v1/chat` | No |
| Knowledge graph (concepts, relationships) | CognitionOS | No |
| Agentic memory (episodes, facts) | Memory Vault via Core AI Backend | No |
| TradingView charts | Client-side `lightweight-charts` | No |

---

## Key Files

```
server/lib/skills.yaml              ← All 8 AI prompt definitions
server/lib/skillLoader.ts           ← Loads skills from YAML at startup
server/lib/skillAwareProvider.ts     ← Skill execution (remote → local fallback)
server/lib/coreAiBackend.ts         ← Core AI Backend HTTP client
server/lib/cognitionOSClient.ts     ← CognitionOS HTTP client
server/lib/memoryVaultClient.ts     ← Memory Vault HTTP client
server/lib/aiProvider.ts            ← Unified AI provider (Core AI only, no Manus)
server/lib/newsIngestion.ts         ← Push news → CognitionOS
server/lib/recommendationIngestion.ts ← Push recommendations → CognitionOS + Memory Vault
server/lib/progressiveExtraction.ts ← Extract concepts from text → CognitionOS
server/lib/tradingDomainSetup.ts    ← Seed graph setup on CognitionOS
server/routers.ts                   ← All tRPC procedures
server/multiAgentAnalysis.ts        ← Multi-agent AI analysis pipeline
server/sentimentNews.ts             ← News sentiment scoring
server/yahooFallback.ts             ← Yahoo Finance data fetcher
drizzle/schema.ts                   ← Database schema (MySQL)
server/db.ts                        ← DB adapter (auto-detects MySQL vs PostgreSQL)
scripts/register-skills.mjs         ← One-time skill registration script
docker-compose.yml                  ← Docker deployment (MySQL 8.0 + app)
Dockerfile                          ← Multi-stage Node.js build
```

---

## Troubleshooting

**Core AI Backend timeout**: The `/v1/chat` endpoint can return 504 on cold starts. The app retries once automatically. If persistent, check `https://ai.s9n.dxb-gw.basanti.ai/health`.

**CognitionOS FalkorDB down**: CognitionOS readiness may show FalkorDB as unhealthy (DNS issue). Document/vector operations via Weaviate + Elasticsearch still work. Graph operations (reasoning nodes) may fail silently.

**Memory Vault Neo4j down**: Episode creation may fail if Neo4j is down on the Core AI Backend. The app handles this gracefully — analysis still completes, just without memory persistence.

**Yahoo Finance rate limiting**: The app has built-in rate limiting (max 3 req/sec) and retry-on-429 logic. If you see persistent 429s, reduce the number of watchlist items.

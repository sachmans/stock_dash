# Project TODO

- [x] Dark command center theme with glassmorphism cards
- [x] Space Grotesk + Inter typography
- [x] Header with portfolio summary (value, P&L, live indicator)
- [x] Hero banner with oil commodity image
- [x] Price chart with 7 time ranges (1D, 5D, 1M, 3M, 6M, 1Y, YTD)
- [x] Position card with BRNT details (250 @ 78.660)
- [x] Market stats strip (day range, 52W high/low, volume)
- [x] News feed with Yahoo Finance insights + fallback news
- [x] Add position dialog for adding new stocks
- [x] Live data via tRPC + Manus Data API (Yahoo Finance)
- [x] 30-second auto-refresh for stock data
- [x] 2-minute auto-refresh for news
- [x] Multiple position tabs support
- [x] Mobile responsive layout with floating add button
- [x] P&L calculation (unrealized, cost basis, market value)
- [x] Write vitest tests for stock data router
- [x] Add watchlist section separate from portfolio
- [x] Add Gold ticker to watchlist
- [x] Add Silver ticker to watchlist
- [x] Add DEWA ticker to watchlist
- [x] Watchlist shows live prices with auto-refresh
- [x] Write vitest tests for watchlist feature
- [x] Make watchlist items clickable to show their chart in the main view
- [x] Add AI stock analysis tRPC procedure using LLM
- [x] Build StockAnalysis UI component with buy/sell confidence gauge
- [x] Show analysis panel for both portfolio and watchlist items
- [x] Write vitest tests for AI analysis feature
- [x] Add forex position type to data model
- [x] Add USD/CHF trade 1: 11 Feb 2026, bought USD 100k, sold CHF 76,750.10 @ 0.767501
- [x] Add USD/CHF trade 2: 25 Mar 2026, bought USD 200k, sold CHF 158,150 @ 0.79075
- [x] Fetch live USD/CHF exchange rate via Yahoo Finance (USDCHF=X)
- [x] Build forex position card showing entry rate, current rate, P&L in both USD and CHF
- [x] Integrate forex positions into the dashboard alongside BRNT
- [x] Write vitest tests for forex positions
- [x] Push all code to sachmans/stock_dash GitHub repo
- [x] Fix forex vitest tests (mock callDataApi properly)
- [x] Explore Core AI Backend API endpoints (ai.s9n.dxb-gw.basanti.ai)
- [x] Explore CognitionOS API endpoints (cognition.s9n.dxb-gw.basanti.ai)
- [x] Build integration to push portfolio/forex data to AI Backend (deferred — memory endpoint times out, CognitionOS used instead)
- [x] Build integration to push context to CognitionOS (concepts stored)
- [x] Add Kora chat interface (built-in LLM, ready for AI Backend swap)
- [x] Push all code to sachmans/stock_dash GitHub repo
- [x] Register new org on CognitionOS for stock tracker
- [x] Register app on AI Backend for stock tracker
- [x] Set up auth credentials for both services
- [x] Fix data API quota exhaustion - add fallback or caching to prevent empty dashboard
- [x] Make banner more generic (not oil-specific)
- [x] Add position open dates to position cards (BRNT and forex)

## Super System Merge (9 Repos + Alpaca Options Trading)
- [x] Research tradingview/lightweight-charts for chart upgrade
- [x] Research OpenBB-finance/OpenBB for multi-source data engine
- [x] Research ZhuLinsen/daily_stock_analysis for automated analysis
- [x] Research HKUDS/AI-Trader for multi-agent trading signals
- [x] Research hsliuping/TradingAgents-CN for multi-agent architecture
- [x] Research mvanhorn/last30days-skill for sentiment-scored news
- [x] Research ashishpatel26/500-AI-Agents-Projects for agent patterns
- [x] Research microsoft/qlib for quant investment pipeline
- [x] Research options trading repos compatible with Alpaca API
- [x] Upgrade charts to TradingView lightweight-charts (candlesticks, indicators, volume)
- [x] Build multi-source data engine (OpenBB-inspired unified data layer)
- [x] Build multi-agent AI analysis (AI-Trader + TradingAgents inspired debate system)
- [x] Build sentiment-scored news feed (last30days-skill inspired multi-source scoring)
- [x] Build Kora chat interface for portfolio Q&A
- [x] Integrate Alpaca options trading logic (documented with reference implementation)
- [x] Final test suite, checkpoint, and GitHub push

## V2: Core AI Backend + CognitionOS + PostgreSQL
- [x] Create server/lib/coreAiBackend.ts — adapter for Core AI Backend chat/completions API
- [x] Create server/lib/cognitionOS.ts — adapter for CognitionOS knowledge graph queries
- [x] Create server/lib/aiProvider.ts — unified AI provider that routes to Core AI Backend (primary) with Manus Forge LLM fallback
- [x] Wire multi-agent analysis (multiAgentAnalysis.ts) to use aiProvider instead of direct invokeLLM
- [x] Wire sentiment news scoring (sentimentNews.ts) to use aiProvider instead of direct invokeLLM
- [x] Wire Kora chat (routers.ts koraChat) to use aiProvider with CognitionOS context enrichment
- [x] Wire single-agent analysis (routers.ts getAnalysis) to use aiProvider
- [x] Add CognitionOS knowledge graph context injection into AI analysis prompts
- [x] Add portfolio concept sync to CognitionOS on position/watchlist changes
- [x] Add environment variables: CORE_AI_BACKEND_URL, CORE_AI_BACKEND_API_KEY, COGNITION_OS_URL, COGNITION_OS_TENANT_ID
- [x] Install pg and @types/pg packages
- [x] Create drizzle/schema-pg.ts with PostgreSQL-compatible schema (pgTable, pgEnum, serial)
- [x] Create server/db-pg.ts with PostgreSQL Drizzle adapter (merged into db.ts with auto-detect)
- [x] Update server/db.ts to auto-detect dialect from DATABASE_URL (mysql:// vs postgres://)
- [x] Update drizzle.config.ts to support dialect switching based on DATABASE_URL
- [x] Add DB_DIALECT env var option for explicit dialect selection
- [x] Test PostgreSQL upsert (ON CONFLICT DO UPDATE vs ON DUPLICATE KEY UPDATE)
- [x] Write tests for Core AI Backend adapter (mock HTTP calls)
- [x] Write tests for CognitionOS adapter (mock HTTP calls)
- [x] Write tests for aiProvider fallback logic
- [x] Write tests for PostgreSQL db adapter (dialect detection tests)
- [x] Verify all 48 tests pass (14 stock + 1 auth + 7 core AI + 8 cognitionOS + 2 aiProvider + 6 db dialect + 10 existing)

## V3: CognitionOS Domain + Memory Vault + Progressive Extraction

### Domain & Seed Graph Setup
- [x] Rewrite server/lib/cognitionOSClient.ts — production CognitionOS HTTP client using actual API contract
- [x] Create server/lib/memoryVaultClient.ts — Memory Vault client via Core AI Backend /v1/memory/ endpoints
- [x] Create server/lib/tradingDomainSetup.ts — Seed graph: provision tenant, create SuperRoot, seed Market hierarchy
- [x] Add tRPC endpoint stock.setupDomain to trigger domain/seed graph initialization
- [x] Add tRPC endpoint stock.getDomainStatus to check CognitionOS graph stats

### News → CognitionOS Push
- [x] Create server/lib/newsIngestion.ts — Ingest news articles as Document nodes linked to instrument Concepts
- [x] Wire sentimentNews.ts to push scored articles into CognitionOS after scoring
- [x] Index news articles in Weaviate via /v1/concepts/vectors/batch
- [x] Create reasoning nodes for sentiment analysis decisions (Graph of Thought)

### Recommendations → CognitionOS + Memory Vault
- [x] Wire multiAgentAnalysis.ts to push agent opinions as ReasoningNode entries
- [x] Wire single-agent analysis to push recommendations as DesignDecision nodes
- [x] Store analysis episodes in Memory Vault for agentic recall
- [x] Store trade-relevant facts in Memory Vault for temporal queries
- [x] Wire Kora chat exchanges as Memory Vault episodes for conversation memory

### Progressive Extraction Pipeline
- [x] Create server/lib/progressiveExtraction.ts — Extract concepts from news/analysis text
- [x] Wire extraction pipeline into news ingestion flow
- [x] Build concept relationship inference (RELATED_TO, SUPPORTS, CONTRADICTS)

### Environment & Configuration
- [x] Set COGNITION_OS_URL to https://cognition.s9n.dxb-gw.basanti.ai
- [x] Set CORE_AI_BACKEND_URL to https://ai.s9n.dxb-gw.basanti.ai
- [x] Set MEMORY_VAULT_URL to https://ai.s9n.dxb-gw.basanti.ai/v1/memory
- [x] Set COGNITION_OS_TENANT_ID to stock_dash
- [x] Add COGNITION_OS_GRAPH_NAME env var (default: stock_trading)

### Tests
- [x] Write tests for CognitionOS client (mock HTTP) — covered in stock.test.ts mocks
- [x] Write tests for Memory Vault client (mock HTTP) — covered in stock.test.ts mocks
- [x] Write tests for news ingestion pipeline — covered in stock.test.ts mocks
- [x] Write tests for recommendation push pipeline — covered in stock.test.ts mocks
- [x] Write tests for progressive extraction — covered in stock.test.ts mocks

## V3.1: Core AI Backend as Sole LLM Provider
- [x] Remove Manus Forge LLM fallback from aiProvider — Core AI Backend is the only LLM provider
- [x] Update aiProvider.ts to call Core AI Backend directly (no circuit breaker fallback to Forge)
- [x] Verify integration tests pass against live Core AI Backend
- [x] Run full test suite with updated provider — all 30 tests pass

## V3.2: Additional QA for Core AI Backend-Only Mode
- [x] Add dedicated aiProvider unit tests for Core-AI-only mode (retry + hard-failure paths) — 14 tests pass
- [x] Add end-to-end test for stock.getAnalysis and koraChat through aiProvider with HTTP mocks — covered in stock.test.ts
- [x] Document expected behavior when Core AI returns 504 (retry once, then surface error) — tested in aiProvider.test.ts

## Bugs
- [x] BUG: Adding to watchlist — investigated, works correctly (AAPL added successfully via dialog)

## V4: Standalone (Off-Manus) Build
- [x] Create `manus` branch on GitHub to preserve current Manus-integrated state
- [x] Strip Manus OAuth — replaced with standalone JWT auth (bcrypt + jose)
- [x] Strip Manus Forge API, storage proxy, data API, LLM, image gen, voice, maps, notifications
- [x] Strip Manus vite plugin, debug collector, and hosting-specific config
- [x] Update env.ts, package.json, and build scripts for standalone operation
- [x] Run tests and verify clean standalone build — all 44 tests pass
- [x] Tag as SDDMini-KH/v1.0.0 and push to GitHub — done

## V4.1: Skill Registration + Docker Deployment + Claude Runner Prompt
- [x] Audit Core AI Backend skill/prompt registration API
- [x] Create skills.yaml with 8 skill definitions (financial_analysis, 4 agents, moderator, sentiment_scorer, kora_chat)
- [x] Create server/lib/skillLoader.ts — YAML parser that loads skill definitions at startup
- [x] Create server/lib/skillAwareProvider.ts — executeSkill/executeChat with local prompt rendering + model routing
- [x] Wire multiAgentAnalysis.ts to use executeSkill for each agent + moderator
- [x] Wire sentimentNews.ts to use executeSkill for sentiment_scorer
- [x] Wire routers.ts getAnalysis to use executeSkill for financial_analysis
- [x] Wire routers.ts koraChat to use executeChat for kora_chat
- [x] Configure model preference: llamacpp (Llama 3.3 / Gemma) primary, Groq fallback
- [x] Create Dockerfile for standalone app (Node.js 22, multi-stage build)
- [x] Create docker-compose.yml (app + MySQL 8.0)
- [x] Create ENV_REFERENCE.md with all required env vars documented
- [x] Create CLAUDE_RUNNER_PROMPT.md with full instructions for Claude on the runner
- [x] Write vitest tests for skillLoader (YAML parsing, prompt rendering) — 10 tests pass
- [x] Update stock.test.ts to mock executeSkill instead of aiInvoke — all 53 tests pass
- [x] Push to GitHub with updated tag SDDMini-KH/v1.1.0

## V4.1.2: Manus LLM Fallback (Temp Demo Fix)
- [x] Add Manus Forge LLM (/v1/chat/completions) as fallback in aiProvider.ts and skillAwareProvider.ts when Core AI Backend is down

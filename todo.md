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

### Core AI Backend Integration (replace Manus Forge LLM)
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

### PostgreSQL Database Support
- [x] Install pg and @types/pg packages
- [x] Create drizzle/schema-pg.ts with PostgreSQL-compatible schema (pgTable, pgEnum, serial)
- [x] Create server/db-pg.ts with PostgreSQL Drizzle adapter (merged into db.ts with auto-detect)
- [x] Update server/db.ts to auto-detect dialect from DATABASE_URL (mysql:// vs postgres://)
- [x] Update drizzle.config.ts to support dialect switching based on DATABASE_URL
- [x] Add DB_DIALECT env var option for explicit dialect selection
- [x] Test PostgreSQL upsert (ON CONFLICT DO UPDATE vs ON DUPLICATE KEY UPDATE)

### Tests
- [x] Write tests for Core AI Backend adapter (mock HTTP calls)
- [x] Write tests for CognitionOS adapter (mock HTTP calls)
- [x] Write tests for aiProvider fallback logic
- [x] Write tests for PostgreSQL db adapter (dialect detection tests)
- [x] Verify all 48 tests pass (14 stock + 1 auth + 7 core AI + 8 cognitionOS + 2 aiProvider + 6 db dialect + 10 existing)

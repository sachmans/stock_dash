# Integration Notes: CognitionOS + Memory Vault + Core AI Backend

## Live Infrastructure Status (Apr 12, 2026)

| Service | URL | Status |
|---|---|---|
| CognitionOS | `https://cognition.s9n.dxb-gw.basanti.ai` | OK (v0.1.0), but FalkorDB down |
| Core AI Backend | `https://dxb-gw.basanti.ai:3006` | Healthy (v3.1.0) |
| Memory Vault API | `https://dxb-gw.basanti.ai:3003` | TLS issue (port-based HTTPS not resolving) |
| Memory Vault Dash | `https://dxb-gw.basanti.ai:3004` | Not tested |

### CognitionOS Dependency Status
- FalkorDB: DOWN (Name resolution error - `falkordb:6379`)
- Weaviate: UP (14ms)
- Elasticsearch: UP (29ms)
- Core AI Backend: UP (5ms)

### Memory Vault via Core AI Backend
- Path: `https://dxb-gw.basanti.ai:3006/v1/memory/`
- Memory health: Postgres connected, Neo4j NOT connected
- Episodes endpoint: `POST /v1/memory/episodes` (requires JWT auth)
- Search endpoint: `POST /v1/memory/search` (requires JWT auth)
- Facts endpoint: `POST /v1/memory/facts` (requires JWT auth)

## API Contracts Summary

### CognitionOS (concept graph)
- Base: `https://cognition.s9n.dxb-gw.basanti.ai`
- Auth: `X-Org-Id` header (required), `Authorization: Bearer <token>` (for reasoning/tenants/analyzers)
- Key endpoints:
  - `POST /v1/graphs/super-root` — Create tenant SuperRoot (idempotent)
  - `POST /v1/graphs/nodes` — Create graph node
  - `POST /v1/graphs/relationships` — Create relationship
  - `POST /v1/concepts` — Add concept with optional parent, domain, confidence
  - `POST /v1/concepts/vectors/search` — Semantic search
  - `POST /v1/concepts/vectors/index` — Index entity for vector search
  - `POST /v1/concepts/vectors/batch` — Batch index
  - `POST /v1/search` — Unified search
  - `POST /v1/sync` — Run sync skills
  - `POST /v1/reasoning/nodes` — Create reasoning node (Graph of Thought)
  - `POST /v1/reasoning/decisions` — Create design decision (ADR)
  - `POST /v1/tenants/provision` — Provision tenant graph
  - `POST /v1/documents` — Ingest document (async task)

### Valid Enum Values
- NodeType: SuperRoot, Concept, Application, Journey, Feature, Requirement, Task, Persona, PainPoint, Goal, Metric, Constraint, JourneyStep, CodeFile, CodeComponent, CodeSpan, Module, Package, TestCase, Skill, Episode, Fact, Story, Person, Organisation, Solution, Document, Email, AgentLog, ReasoningNode, DesignDecision
- RelationshipType: CONTAINS, PARENT_OF, HAS_JOURNEY, HAS_FEATURE, HAS_REQUIREMENT, HAS_TASK, RELATED_TO, SIMILAR_TO, DERIVED_FROM, ALIGNS_WITH, SUBCONCEPT_OF, GENERALISES, REQUIRES, EXTENDS, DEPENDS_ON, EXTRACTED_FROM, AUTHORED_BY, PRECEDES, CO_OCCURS_WITH, SUPPORTS, CONTRADICTS, REASONS_ABOUT, OWNS, etc.
- GraphType: product, people, concept, code, kit, custom

### Memory Vault (via Core AI Backend /v1/memory/)
- Auth: JWT Bearer token (org_id and user_id extracted from JWT)
- `POST /v1/memory/episodes` — Create episode (content, summary, timestamp, project_id, extra_metadata)
- `POST /v1/memory/search` — Search episodes (query, limit, timestamp_start/end, user_id, project_id)
- `POST /v1/memory/facts` — Create facts (fact_type, content, valid_from, valid_to, metadata)
- `GET /v1/memory/episodes/{episode_id}` — Get specific episode

## Core AI Backend Error Handling (504 / Transient Failures)

The Core AI Backend (`ai.s9n.dxb-gw.basanti.ai`) is the **sole LLM provider** — there is no Manus Forge fallback.

The `aiProvider.ts` module implements the following error handling strategy:

| Error Type | Examples | Behavior |
|---|---|---|
| Transient (5xx, timeout, network) | 500, 502, 503, 504, ECONNREFUSED, timeout, fetch failed | Retry once after 1s delay |
| Non-transient (4xx, parse) | 400, 422, JSON parse error | Fail immediately (no retry) |
| Retry also fails | Second attempt returns 5xx or timeout | Throw `Core AI Backend failed after retry` |

When the Core AI Backend is unavailable:
- **AI Analysis** (`stock.getAnalysis`): Returns `null`, UI shows "Analysis unavailable" message
- **Multi-Agent Analysis** (`stock.getMultiAgentAnalysis`): Returns `null`, UI shows fallback state
- **Sentiment Scoring** (`sentimentNews.ts`): Skips scoring, returns raw news without sentiment
- **Kora Chat** (`stock.koraChat`): Throws error, UI shows "AI service temporarily unavailable" toast

The `getProviderStatus()` function exposes health metrics (consecutive failures, last success/failure timestamps) via the `cognition.aiProviderStatus` tRPC endpoint for monitoring.

## Tenant/Domain Setup Plan
1. Provision tenant `stock_dash` with graph_type `concept` on CognitionOS
2. Create SuperRoot node for the trading domain
3. Seed initial concept hierarchy: Market > Equities/Forex/Commodities > individual instruments
4. Wire news articles as Document nodes linked to instrument Concept nodes
5. Wire AI recommendations as ReasoningNode (type: decision) linked to instruments
6. Store analysis episodes in Memory Vault for agentic memory recall

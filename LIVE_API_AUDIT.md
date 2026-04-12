# Live API Audit — April 12, 2026

## Core AI Backend (`ai.s9n.dxb-gw.basanti.ai`)
- **Chat endpoint**: `POST /v1/chat` — NO AUTH REQUIRED
  - Request: `{ messages: [{role, content}], model?, temperature?, max_tokens? }`
  - Response: `{ response, model, usage: {prompt_tokens, completion_tokens, total_tokens}, finish_reason }`
  - Default model: `llama-3.3-70b-versatile`
- **LLM Generate**: `POST /v1/llm/generate` — NO AUTH REQUIRED
  - Request: `{ prompt, system_prompt?, provider?, model? }`
  - Response: `{ text, provider, model, tokens_used }`
- **App Registration**: `POST /v1/apps/register` — REQUIRES admin JWT
  - Returns `app_key` for app-scoped chat
- **Memory**: `POST /v1/memory/episodes` — REQUIRES JWT
- **Memory Search**: `POST /v1/memory/search` — REQUIRES JWT

## CognitionOS (`cognition.s9n.dxb-gw.basanti.ai`)
- Health: UP (Weaviate + Elasticsearch healthy, FalkorDB DNS issue)
- All endpoints use `X-Org-Id` header
- Concepts, nodes, relationships, vector search, documents, reasoning nodes

## Key Insight
The `/v1/chat` endpoint on Core AI Backend returns a DIFFERENT format than Manus Forge LLM:
- Core AI: `{ response: "text", model, usage, finish_reason }` (flat)
- Manus Forge: `{ choices: [{ message: { content: "text" } }], model, usage }` (OpenAI format)

This means we need an adapter that normalizes the Core AI Backend response into the InvokeResult format.

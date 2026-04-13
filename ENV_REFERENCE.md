# StockDash — Environment Variables Reference

Copy these to your `.env` file or set them in your deployment environment.
Docker Compose reads `.env` automatically.

## Required

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string. Format: `postgresql://user:pass@host:5432/dbname`. The app auto-detects dialect from URL prefix (`postgresql://` or `mysql://`). | `postgresql://stockdash:stockdash_local_2024@localhost:5432/stockdash` |
| `JWT_SECRET` | Secret for signing JWT session tokens. Min 32 characters. | — |
| `CORE_AI_BACKEND_URL` | URL of your Core AI Backend instance. `/v1/chat` needs no auth. Model routing: llamacpp (local Llama 3.3 / Gemma / Qwen) → Groq fallback. | `https://ai.s9n.dxb-gw.basanti.ai` |
| `COGNITION_OS_URL` | URL of your CognitionOS instance (knowledge graph). | `https://cognition.s9n.dxb-gw.basanti.ai` |

## Optional

| Variable | Description | Default |
|---|---|---|
| `CORE_AI_BACKEND_JWT` | JWT for remote skill execution via `/v1/skills/run-by-name`. Without this, the app uses local prompt rendering (`skills.yaml`) + `/v1/chat`. | — |
| `COGNITION_OS_TENANT_ID` | Tenant ID for graph isolation. | `stock_dash` |
| `COGNITION_OS_GRAPH_NAME` | Graph name for the trading domain. | `stock_trading` |
| `MEMORY_VAULT_URL` | URL for Memory Vault API (sub-service of Core AI Backend). | `https://ai.s9n.dxb-gw.basanti.ai/v1/memory` |
| `PORT` | Port to listen on. | `3000` |
| `NODE_ENV` | Node environment. | `production` |

## Docker Compose Only

| Variable | Description | Default |
|---|---|---|
| `DB_PASSWORD` | PostgreSQL password for the `stockdash` user in the docker-compose `db` service. | `stockdash_local_2024` |
| `DB_PORT` | Expose PostgreSQL on this host port. | `5432` |

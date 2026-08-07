# AGENTS.md

## Project

SGFleet service: FastAPI gateway + React admin dashboard for managing API users, rate limits, usage metrics, and dynamic model containers.

## Stack

- **Backend:** Python 3.12, FastAPI, Uvicorn, SQLite (aiosqlite), bcrypt, httpx, Docker SDK (via CLI)
- **Frontend:** React 19, TypeScript, Vite, TanStack Query, Tailwind CSS 4, Chart.js

## Commands

```bash
# Frontend
cd admin/frontend
npm install              # install dependencies
npm run dev              # dev server
npm run build            # production build (tsc + vite)
npm run lint             # eslint

# Backend
ruff check app/          # lint
# Dev: uvicorn app.main:app --reload --port 8000

# Full deploy (rebuilds admin image + restarts admin container)
cd admin && ./deploy.sh
```

## Architecture

- `admin/app/` — Python backend (gateway, admin API, metrics, auth, DB, model lifecycle)
- `admin/frontend/src/` — React SPA (pages, hooks, components, API client)
- `models.json` — Bootstrap config for all model definitions (3 models)
- Docker Compose orchestrates model containers (`sgfleet-*`), `admin`, monitoring stack

### Model Management (Key Concept)

Models are stored in SQLite (`models` table) and bootstrapped from `models.json` on first run. A single active model at a time is the "primary" model receiving the `sgfleet-server` network alias for backward compatibility.

**Startup flow** (`main.py:lifespan` → `_start_model_sync`):
1. `init_db()` runs migrations and bootstraps models from `models.json`
2. `reload_cache()` loads all models into `model_registry` in-memory cache
3. `ensure_models_sync()` from `docker_manager` reconciles running containers:
   - Stops inactive model containers
   - Stops stray `sgfleet-*` containers not in config
   - Starts active models with `docker run`, assigning `sgfleet-server` alias to primary
   - **Health-wait**: after each `docker run`, polls `{container}:{port}/health` for up to `MODEL_STARTUP_TIMEOUT` (default 600s) before considering the model ready
4. `set_ready_ids()` marks only models that passed the health check as ready
5. Gateway only routes traffic to models in the ready set

**GPU allocation** (`docker_manager.py:build_docker_run_cmd`):
- `gpu: "auto"` → `--gpus all` (all GPUs)
- `gpu: "0"`, `"1"`, etc. → `--gpus device=0`
- DB stores `NULL` for auto; `model.get("gpu") or "auto"` provides the fallback

**Gateway routing** (`gateway.py:_determine_target_endpoint`):
1. If request body has a `model` field, look up that specific model
2. Check model is active AND in the ready set via `is_ready()`
3. If found, return its endpoint
4. Fallback: return first active+ready model's endpoint
5. If none ready, return `None` → gateway returns 503 JSON

**Gateway error handling** (`gateway.py:stream_generator`):
- DNS failures (`socket.gaierror`) → auto-remove model from ready set, return 502 with "container_missing"
- Other connect errors → return 503 with "upstream_unreachable"
- Logs always include target URL and model_id for debugging

**Model CRUD** (`admin_api.py`):
- `POST /admin/api/models` — create model (DB only, no container start)
- `PUT /admin/api/models/{id}` — update model config
- `DELETE /admin/api/models/{id}` — stop container + delete from DB (must be inactive)
- `POST /admin/api/models/{id}/start` — start container + health-wait + mark ready
- `POST /admin/api/models/{id}/stop` — stop container + mark not ready
- `POST /admin/api/models/{id}/toggle` — flip active flag + full `ensure_models_sync`
- `POST /admin/api/model/test` — send test chat completion to model server
- `GET /admin/api/model/health` — check `/health` and `/v1/models` on model container

**Model registry** (`model_registry.py`):
- `_models_cache`: all models from DB, keyed by `model_id`
- `_ready_ids`: set of model_ids that passed health checks
- `get_active_models_cached()`: returns models that are both active AND ready
- `get_endpoint()`: returns `None` if model isn't in ready set
- All cache operations invalidate `_first_active_endpoint` TTL

### Key Files

- `app/db.py` — SQLite layer, migrations (v11+), model/user CRUD, bootstrapping
- `app/docker_manager.py` — container lifecycle, health-wait, `ensure_models_sync`
- `app/model_registry.py` — in-memory model cache, ready set, endpoint lookup
- `app/gateway.py` — request proxy, per-model routing, rate limiting, auth
- `app/admin_api.py` — admin REST endpoints (users, models, health, test, config)
- `app/main.py` — FastAPI app, startup model sync, middleware
- `frontend/src/api/client.ts` — API client with `testModel()`, `getModelHealth()`
- `frontend/src/pages/ModelsPage.tsx` — model management UI with per-model health polling
- `frontend/src/components/Layout.tsx` — header health poll, global test button
- `frontend/src/hooks/useModelHealth.ts` — health polling hook (per-model queries)

## Conventions

- Python: ruff (E, F, W, I, UP, B, SIM), line-length 120
- TypeScript: ESLint (react-hooks), strict tsc
- Model containers use `sgfleet-*` naming prefix and `sgfleet_default` Docker network
- The `sgfleet-server` alias is assigned to the primary (first active) model container
- All model containers mount `YOUR_MODELS_PATH/vllm_models:/models`
- Frontend data fetching via TanStack Query — no bare fetch/XHR hooks
- Admin container has GPU device reservations for direct `nvidia-smi` access in GPU detection
- HuggingFace token stored in DB `config` table (`hf_api_token`) or via `HUGGINGFACE_TOKEN` env var

## Linting

Always run after changes and fix all errors/warnings before considering a task done. This includes lint and LSP errors that may have been introduced by changes in another session — do not leave them unresolved.

```bash
cd admin/frontend && npm run lint
ruff check app/          # from admin/
```

## Testing

```bash
# Backend (130 tests)
cd admin && python3 -m pytest tests/ -v

# Frontend (61 tests)
cd admin/frontend && npx vitest run
```

Both are strict unit tests. No integration or E2E yet — those are scoped as future work.

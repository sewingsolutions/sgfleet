# sgfleet-admin

API gateway, rate limiter, and admin dashboard for SGFleet. Manages multiple model profiles dynamically via Docker.

## Architecture

```
Client ──▶ sgfleet-admin:8000 ──▶ sgfleet-<model>:30000
            (gateway + admin)       (SGLang LLM container, dynamic)

            ├── /v1/*          Auth → rate limit → model routing → proxy to upstream
            ├── /admin/*       React SPA + admin API (session auth)
            └── /admin/metrics Prometheus text format (scraped by Alloy → Grafana)
```

**Stack:** FastAPI + Uvicorn backend, React 19 + Vite + Tailwind CSS frontend, SQLite database.

### Data flow (gateway)

1. Client sends `Authorization: Bearer <api_key>` to `/v1/chat/completions`
2. Gateway verifies key (SHA256 quick hash + bcrypt), checks rate limit (token bucket) and concurrent limit
3. Checks daily quota against `user_usage` table
4. Routes to model: request body `model` field → user default model → first active model
5. Per-model access control: restricted users can only access assigned models
6. Proxies to active model container with streaming response
7. On success: fire-and-forget usage tracking (1 request + cost per `request_cost`)
8. If no active model ready: returns 503 with `{"error": {"type": "model_unavailable"}}`

### Model management

Models are bootstrapped from [`models.json`](../models.json) on first run (migration v11) and stored in the SQLite `models` table. Containers are started/stopped dynamically by `docker_manager.py` — no docker compose profiles needed.

- Single active model at a time (receives `sgfleet-server` network alias)
- Per-request routing: `model` field in request body targets a specific model
- User access control: per-model user assignments via `user_model_access` table
- Per-user default model: set via admin UI or API

### Model download (HuggingFace Hub)

Download new models directly from HuggingFace Hub via the admin UI:

1. **Search**: Browse HF models, filtered by available VRAM based on local GPU detection
2. **Download**: SSE-streamed download with real-time progress; only downloads necessary files (weights, config, tokenizer)
3. **GPU detection**: Uses `nvidia-smi` directly (admin container has GPU access) to discover available GPUs and VRAM
4. **Auto-config**: After download, generates a model config entry ready to be activated

**HuggingFace token**: For gated models, store your HF API token via the admin Settings page or `POST /admin/api/settings/hf-token`. Also supports `HUGGINGFACE_TOKEN` env var.

### Database (SQLite at `/data/admin.db`)

| Table | Description |
|-------|-------------|
| `users` | API keys, limits, cost, quota, `default_model_id` |
| `user_usage` | hourly request counts and cost per user |
| `models` | model definitions (image, path, port, GPU, env, flags) |
| `user_model_access` | many-to-many user ↔ model access assignments |
| `config` | admin key hash, migration version, default settings, HuggingFace API token |
| `webhooks` | notification endpoints for quota/key events |
| `admin_log` | persistent request and admin action log |

Per-user settings: `rate_limit` (req/s), `max_concurrent`, `request_cost` ($), `daily_quota` (requests/day, NULL = unlimited).

### Prometheus metrics

Exported at `/admin/metrics` with user label on all counters:
- `gateway_requests_total`
- `gateway_auth_failures_total`
- `gateway_rate_limit_rejections_total`
- `gateway_concurrent_limit_rejections_total`
- `gateway_request_latency_seconds`
- `gateway_upstream_status_total`

### Admin API

All under `/admin/api/`, admin-authenticated (Bearer token or session cookie):

**Users:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/users` | List all users |
| POST | `/users` | Create user + return API key |
| PATCH | `/users/{id}` | Update limits, cost, quota |
| POST | `/users/{id}/rotate` | Rotate API key |
| DELETE | `/users/{id}` | Soft-delete |
| PATCH | `/users/bulk` | Bulk enable/disable users |
| GET | `/users/{id}/summary` | All-time + today's usage stats |
| GET | `/users/{id}/model-access` | Models assigned to user |
| GET | `/users/{id}/default-model` | User's default model |
| PUT | `/users/{id}/default-model` | Set user's default model |
| POST | `/users/{id}/config` | Generate opencode.json config snippet |

**Models:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/models` | List all models with container status |
| GET | `/models/{id}` | Get model detail |
| POST | `/models` | Create model |
| PUT | `/models/{id}` | Update model |
| DELETE | `/models/{id}` | Delete inactive model |
| POST | `/models/{id}/start` | Start model container |
| POST | `/models/{id}/stop` | Stop model container |
| POST | `/models/{id}/toggle` | Toggle active (triggers sync) |
| GET | `/models/{id}/users` | Users with access to model |
| PUT | `/models/{id}/users` | Set user access for model |
| POST | `/models/export` | Export models as JSON |
| POST | `/models/import` | Import models from JSON |

**Health & config:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/model/health` | Primary model health check |
| GET | `/model/health?model_id=x` | Per-model health check |
| GET | `/model/config` | Primary model runtime config |
| GET | `/model/config?model_id=x` | Per-model runtime config |
| GET | `/settings/server_info` | Active models + live model info |
| GET | `/settings/defaults` | Default values for new users |
| PATCH | `/settings/defaults` | Update defaults |
| POST | `/settings/import_users` | Bulk import users from JSON |
| POST | `/settings/export_db` | Export full database as JSON |
| POST | `/settings/rotate_admin_key` | Rotate admin API key |

**Logs & audit:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/audit_log` | Admin action log |
| GET | `/users/{id}/requests` | User request log |
| GET | `/logs` | Gateway log viewer (filterable) |
| GET | `/logs/config` | Log level config |
| PATCH | `/logs/config` | Update log level |

**Webhooks:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/webhooks` | List webhook endpoints |
| POST | `/webhooks` | Create webhook |
| PATCH | `/webhooks/{id}` | Update webhook |
| DELETE | `/webhooks/{id}` | Delete webhook |

**Model download (HuggingFace Hub):**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/download/search?q=...` | Search HF models (cached) |
| GET | `/download/disk-space` | Available disk space at model dir |
| GET | `/download/path-exists?path=...` | Check if model path has weights |
| GET | `/download/stream?model_id=...&target_dir=...` | Download model (SSE progress) |
| POST | `/download/model-config` | Generate model config from HF model |
| POST | `/download/cleanup` | Remove incomplete download |
| GET | `/settings/hf-token` | Get stored HF API token |
| POST | `/settings/hf-token` | Set HF API token |

## Building & deploying

### Setup

```bash
# Backend dependencies
pip install -r requirements.txt

# Frontend dependencies
cd frontend && npm install
```

### Checks

Run linting and tests before deploying:

```bash
# Lint
ruff check app/                                # Python lint
cd frontend && npm run lint                    # TypeScript/ESLint

# Tests
python3 -m pytest tests/ -v                    # Backend: 130 unit tests
cd frontend && npx vitest run                  # Frontend: 61 unit tests
```

Both test suites are strict unit tests — backend uses pytest + pytest-asyncio with temp SQLite, frontend uses vitest + jsdom + @testing-library/react.

### Local dev

```bash
# Backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000

# Frontend
cd frontend && npm install && npm run dev
```

### Docker deploy

```bash
# Full stack (from repo root)
docker compose up -d

# Hot-reload admin only (never touches GPU containers)
cd sgfleet-admin && ./deploy.sh
```

Requires `.env` with `ADMIN_API_KEY`. Optionally `HUGGINGFACE_TOKEN` for gated model downloads.

### Volumes

| Name | Path | Contents |
|------|------|----------|
| admin_db | /data | SQLite database |
| switch_status | /opt/switch | Active model status file |

## Quick start

1. Start stack: `docker compose up -d`
2. Open `http://localhost:8000/admin/login`
3. Login with `ADMIN_API_KEY`
4. Create user → copy API key → use in client:
   ```
   curl -H "Authorization: Bearer sk-xxx" http://localhost:8000/v1/chat/completions
   ```
5. Switch models from the admin dashboard — active model starts, inactive stops

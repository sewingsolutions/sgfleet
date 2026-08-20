# SGFleet
SGFleet is a self-hosted AI gateway and container orchestrator built specifically for SGLang.
Manage users, quotas, Hugging Face models, and GPU Docker containers from a single Web UI.
Currently supports Nvidia GPUs.

The gateway exposes OpenAI-compatible and Anthropic-compatible endpoints, and every user can generate ready-to-paste client configs from their own portal (OpenCode, Continue.dev, Cline/Roo Code, Open Interpreter, Cursor, Claude Code).

## Architecture

```
Client ──▶ sgfleet-frontend:80 (nginx) ──▶ sgfleet-backend:8000 (FastAPI) ──▶ sgfleet-<model>:30000
                    │                                    │                              (SGLang LLM)
                     ├── Serves React SPA at /admin/*     ├── /api/* (admin API)
                     └── Proxies API/gateway to backend   ├── /v1/* (gateway proxy)
                                                          └── /health/* (passthrough)
```

**Stack:** FastAPI + Uvicorn backend, React 19 + Vite + Tailwind CSS frontend, SQLite database.

## Services

| Service | Port | Description |
|---------|------|-------------|
| frontend | 8000 | nginx + React SPA, proxies API/gateway requests to backend |
| backend | (internal) | FastAPI gateway, admin API, dynamic model orchestration |
| alloy | 12345 (internal) | Grafana Alloy → external Prometheus (profile `monitoring`) |
| sgfleet-* | 30000 (internal) | Model containers, started/stopped dynamically by backend |

## Features

**Gateway**
- OpenAI-compatible API (`/v1/chat/completions`, `/v1/models`, …) plus Anthropic-compatible `/v1/messages` for Claude Code, with matching error formats
- Auth via `Authorization: Bearer <key>` or `X-API-Key` header
- Per-user rate limit (token bucket), concurrent request limit, and daily quota; a `quota_warning` webhook fires at 80% of the daily quota
- Per-model access control and per-user default model routing
- Streaming responses with token-usage extraction from both OpenAI and Anthropic SSE formats, used for cost and quota tracking

**Users**
- Per-user API keys (`sk-…`) with rotation; looked up by SHA256 index + bcrypt verification
- Per-user rate limit, max concurrent, request cost, and optional daily quota
- Per-user model assignment and default model; bulk editing and JSON import of users

**User portal** (`/user`)
- Login with your own API key; dashboard with usage stats and line charts (requests, tokens) over time
- Quota & usage, request history, and authorized-models views
- Self-service config generation for your key and API key rotation

**Config generator** (admin UI and user portal)
- OpenCode, Continue.dev, Cline/Roo Code, Open Interpreter, Cursor (step-by-step checklist), Claude Code (shell env via the Anthropic endpoint)

**Admin dashboard** (`/admin`)
- Dashboard with fleet stats and request metrics (line charts)
- Model management: add/edit/delete, GPU assignment, environment variables, command flags, start/stop/toggle, test prompt, live container logs, per-field version history with revert
- Model export/import as JSON; model download page with HuggingFace search (VRAM filter), disk-space check, live download progress, and auto-generated model entries
- User management: create/edit/delete, model access, default model, key rotation, import
- Webhooks with per-webhook event subscription, HMAC-SHA256 signed payloads
- Audit log of admin actions, request log viewer with adjustable log level
- Settings: default rate limit / concurrency / cost, base URL, HF token, admin key rotation, full database export
- Release notes page showing the running build's commit log

## Models

Models are discovered from your local model directory. Place model directories under the path specified in `.env` (`MODELS_DIR`), then run `./scripts/init.sh` — it will scan the directory and prompt you to add each one as a model entry in `models.json`.

The first model added will be set as active. You can change which model is active, or add and remove models at any time from the admin UI. Only one model is active at a time; the active model receives the `sgfleet-server` network alias. A `models.json.example` file is provided as a template for manual configuration.

**Download new models**: The admin dashboard includes a model download page that searches HuggingFace Hub, checks available VRAM, and downloads models directly to disk with real-time progress. For gated models, set a HuggingFace API token via Settings.

## Prerequisites

SGFleet requires a Linux host with Docker and GPU passthrough. Run `./scripts/init.sh` to verify — it checks for:

| Requirement | Script behavior | Notes |
|---|---|---|
| Docker | Fails if missing | Engine and CLI |
| Docker Compose | Fails if missing | Compose plugin (v2) |
| `nvidia-smi` | Warns if absent; fails if present but broken | GPU driver check |
| `nvidia-ctk` | Warns if absent | NVIDIA Container Toolkit — containers cannot access GPUs without it. Install from [NVIDIA docs](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) |
| `openssl` | Fails if missing | Generates the encryption key for secrets management |

**Nvidia GPUs are the only supported hardware.** AMD/Intel GPUs are not supported. Both `nvidia-smi` and `nvidia-ctk` are needed for model inference even though the setup script only warns about them.

## Quick start

```bash
# First run — interactive setup
./scripts/init.sh

# Start services
docker compose up -d

# Optional: also start Grafana Alloy metrics forwarding
docker compose --profile monitoring up -d
```

Then open `http://<server>:8000/admin/setup` and complete the first-boot wizard — it generates the admin API key (shown once). After that, the admin dashboard is at `http://<server>:8000/admin/login`.

`scripts/init.sh` validates repo root, collects `.env` configuration (model directory, base URL, Prometheus host), and auto-generates an encryption key. If `.env` already exists, it offers a merge with keep/update/remove per key. After `.env` is configured, it scans `MODELS_DIR` for model directories and interactively builds `models.json`.

On startup, backend:
1. Seeds the `models` table from `models.json` if exists
2. Starts any active model container via `docker run`
3. Returns 503 on `/v1/*` until a model is ready

## Screenshots
Have a look at [SCREENSHOTS.md](SCREENSHOTS.md) for a visual overview of the admin dashboard and model management.

## Components

- **backend/** — Python backend (gateway, admin API, metrics, auth, DB, model lifecycle)
- **frontend/** — React SPA (pages, hooks, components, API client)
- **telemetry/alloy/** — Grafana Alloy config, forwards metrics to external Prometheus
- **scripts/** — Host initialization & utility scripts
- **models.json** — Generated by `scripts/init.sh` from directories in `MODELS_DIR` (template: `models.json.example`)

## First-Boot Setup Wizard

The service returns 503 (`setup_required`) on all gateway and admin endpoints until `/admin/api/system/setup` is called. The wizard at `/admin/setup` collects admin name, base URL, and optional HF token, then generates an admin API key (shown once).

## Secrets Management

Secrets (`admin_api_key`, `hf_api_token`) are encrypted with Fernet and stored in SQLite `config` table. The encryption key (`SGFLEET_ENCRYPTION_KEY`) is generated by `scripts/init.sh` and stored in `.env`.

User API keys are stored in the SQLite `users` table as a bcrypt hash (for O(1) lookup) plus a raw copy, which is required for session signing and OpenAI client config generation. The database lives in the `admin_db` Docker volume and is not exposed over the network.

## Data flow (gateway)

1. Client sends `Authorization: Bearer <api_key>` (or `X-API-Key`) to `/v1/*` (OpenAI-compatible) or `/v1/messages` (Anthropic-compatible)
2. Gateway verifies key (SHA256 quick hash + bcrypt), checks rate limit (token bucket) and concurrent limit
3. Checks daily quota against `user_usage` table (fires `quota_warning` webhook at 80%)
4. Routes to model: request body `model` field → user default model → first active model
5. Per-model access control: restricted users can only access assigned models
6. Proxies to the model container with streaming response
7. On success: extracts token usage (including from SSE streams) and tracks cost/quota fire-and-forget
8. If no active model ready: returns 503 (Anthropic-shaped error body on `/v1/messages`)
9. On upstream DNS failure the model is dropped from the ready set until its next health check

## Model Management

Models are stored in SQLite and bootstrapped from `models.json` on first run. A single active model at a time is the "primary" model receiving the `sgfleet-server` network alias.

- `POST /admin/api/models/{id}/toggle` — flip active flag + full container sync
- `POST /admin/api/models/{id}/start` — start container + health-wait
- `POST /admin/api/models/{id}/stop` — stop container

The admin UI builds on these: add/edit/delete models (image, path, GPU assignment, environment variables, command flags, context length), per-field version history with one-click revert, a test-prompt endpoint, live container log streaming, health status, and JSON export/import of the full model set. The model download page can auto-generate a model entry from HuggingFace metadata (image, flags, VRAM-based context length) after a download completes.

## Developing

### Deploy changes

```bash
# Backend only (rebuilds image + restarts container)
cd backend && ./deploy.sh

# Frontend only (rebuilds image + restarts container)
cd frontend && ./deploy.sh
```

### Lint & test

```bash
# Backend
cd backend
ruff check app/ tests/         # lint
python3 -m pytest tests/ -v    # unit tests

# Frontend
cd frontend
npm run lint                   # eslint
npx vitest run                 # unit tests
```

### Local dev

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000

# Frontend
cd frontend
npm install
npm run dev
```

## Access

- **Admin login:** API key generated by the first-boot setup wizard (shown once after setup completes)
- **API access:** `Bearer sk-xxx` header, issued per user via admin dashboard
- **Grafana/Prometheus:** external instance (configured via `PROMETHEUS_HOST` in `.env`)

## License

MIT — see [LICENSE](LICENSE).

## Getting help

Open an [issue](https://github.com/sewingsolutions/sgfleet/issues) for bugs and questions.

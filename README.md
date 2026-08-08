# SGFleet

Self-hosted LLM inference gateway with multi-model management, auth, rate limiting, and monitoring.

## Services

| Service | Port | Description |
|---------|------|-------------|
| admin | 8000 | API gateway + admin dashboard + dynamic model orchestration |
| alloy | 12345 (internal) | Grafana Alloy → external Prometheus (configurable via `PROMETHEUS_HOST`) |
| sgfleet-* | 30000 (internal) | Model containers, started/stopped dynamically by admin |

## Models

Configured in [`models.json`](models.json). Three model profiles ship by default:

| Model ID | Name | Context | Output |
|----------|------|---------|--------|
| `qwen36-27b` | Qwen 3.6 27B (FP8) | 196K | 8K |
| `gpt-oss-20b` | gpt-oss 20b (FP4) | 131K | 8K |
| `gemma4-31b` | Gemma 4 31B (FP8) | 262K | 8K |

Only one model is active at a time. The active model receives the `sgfleet-server` network alias. Models are managed from the admin UI or API — no docker compose profiles needed.

**Download new models**: The admin dashboard includes a model download page that searches HuggingFace Hub, checks available VRAM, and downloads models directly to disk with real-time progress. For gated models, set a HuggingFace API token via Settings or the `HUGGINGFACE_TOKEN` env var.

## Quick start

```bash
# First run — interactive setup
./init.sh

# Start services
docker compose up -d

# Open admin dashboard
# http://<server>:8000/admin/login
```

`init.sh` validates repo root, collects `.env` configuration (admin key, model directory, HuggingFace token, Prometheus host), and auto-generates an admin API key. If `.env` already exists, it offers a merge with keep/update/remove per key.

On startup, admin:
1. Seeds the `models` table from `models.json` (migration v11)
2. Starts any active model container via `docker run`
3. Returns 503 on `/v1/*` until a model is ready

## Components

- **admin/** — gateway, admin dashboard, and dynamic model lifecycle. See [admin/README.md](admin/README.md)
- **models.json** — bootstrap configuration for all available models
- **alloy/** — Grafana Alloy config, forwards metrics to external Prometheus

## Deploy changes

```bash
# Admin dashboard only (does not restart GPU containers)
cd admin && ./deploy.sh
```

## Access

- **Admin login:** `ADMIN_API_KEY` from `.env`
- **API access:** `Bearer sk-xxx` header, issued per user via admin dashboard
- **Grafana/Prometheus:** external instance (configured via `PROMETHEUS_HOST` in `.env`)

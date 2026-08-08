# AGENTS.md

## Project

SGFleet LLM inference gateway with dynamic model management, API gateway, user management, and metrics.

## Stack

- SGLang (Qwen3.6-27B-FP8, gpt-oss-20b, Gemma 4 31B), Docker Compose, Grafana Alloy, Prometheus
- Models stored at `YOUR_MODELS_PATH/vllm_models/` (mounted as `/models` in containers)
- Model config in `models.json`, persisted in SQLite (`admin_db` volume)

## Commands

- `docker compose --profile qwen up -d` — start all services (Qwen active by default in models.json)
- `cd admin && ./deploy.sh` — rebuild + restart admin only
- Model switching is now done via the admin UI or `POST /admin/api/models/{id}/toggle`

### Starting a specific model container manually
```bash
# From within the admin container or with Docker socket access:
docker run -d --name sgfleet-gpt-oss-20b --network sgfleet_default --network-alias sgfleet-gpt-oss-20b \
  --gpus all --shm-size 32g --ipc host --privileged --restart unless-stopped \
  -v YOUR_MODELS_PATH/vllm_models:/models lmsysorg/sglang:v0.5.16 \
  sglang serve --model-path /models/gpt-oss-20b --host 0.0.0.0 --port 30000 [flags...]
```

## Structure

- `admin/` — gateway + admin dashboard (see admin/AGENTS.md)
- `alloy/` — Grafana Alloy config
- `models.json` — model definitions (bootstrapped into SQLite on first run)
- `docker-compose.yml` — service orchestration (admin, monitoring; model containers managed by admin)

## Model Management (How It Works)

Models are defined in `models.json` and bootstrapped into SQLite on first startup. The admin service (`admin`) manages model container lifecycle:

- **Startup**: `main.py` runs `ensure_models_sync()` which starts active models, waits for `/health` (up to 600s), and marks them ready. Inactive models are stopped.
- **Active/Ready**: A model must be both `active` in the DB AND pass the health check before the gateway routes traffic to it.
- **Primary Model**: The first active model gets the `sgfleet-server` network alias for backward compatibility with clients using that hostname.
- **GPU Allocation**: `gpu: "auto"` uses all GPUs; `"0"`, `"1"` etc. target specific GPUs. DB stores `NULL` for auto.
- **Switching**: Toggle active flag via admin UI or API → triggers full container sync (stops old, starts new, health-waits).
- **GPU Detection**: `detect_gpus()` in `hf_downloader.py` tries host `nvidia-smi` first (admin container has GPU access), falls back to Docker. Used for VRAM filtering during model search.
- **Model Download**: `hf_downloader.py` handles HF Hub search, disk checks, Docker-based downloads with SSE progress, and auto-generates model configs.

## Rules

- Always fix lint and LSP errors before considering a task done, even if the errors were introduced by changes in another session
- Never manually `docker exec` or restart model containers — use the admin API or UI
- The admin container has Docker socket access to manage model containers
- Database is SQLite at Docker volume `admin_db:/data`
- Metrics flow: admin:8000/admin/metrics → Alloy → external Prometheus (configured via `PROMETHEUS_HOST` in `.env`)
- User configs use generic model ID `sgfleet-api-model` — never stale across model switches; admin sees `live_model_id` and `live_model_name` from `/v1/models` for real running model info
- Health-wait on startup blocks the container start until the model's `/health` returns success (default 600s timeout)
- Gateway returns 503 JSON when no model is ready, or auto-drops a model from the ready set on DNS failure
- Admin container has GPU device reservations (all GPUs) for direct `nvidia-smi` access in GPU detection
- HuggingFace token stored in DB `config` table (`hf_api_token`) or via `HUGGINGFACE_TOKEN` env var; used for gated model downloads

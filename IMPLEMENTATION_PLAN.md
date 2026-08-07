# Dynamic Model Management - Implementation Plan

## Status: Complete

---

### Phase A: Data Layer

- [x] **A1**: Create `models.json` at repo root with all 3 models (env vars, command flags, GPU settings, active flags)
- [x] **A2**: `db.py` - Migration v11: create `models` table, `user_model_access` table, add `default_model_id` to users, bootstrap from `models.json` or seed defaults

### Phase B: Backend Core

- [x] **B1**: `app/model_registry.py` (new) - in-memory model cache from DB, `get_active_models()`, `get_model_by_id()`, `get_endpoint()`, `get_model_health()`, `get_active_endpoint()`, `get_cached_endpoint()`, `all_models()`
- [x] **B2**: `app/docker_manager.py` (new) - `build_docker_run_cmd()`, `start_model()`, `stop_model()`, `ensure_models_sync()`, `get_container_status()`, safety sweep
- [x] **B3**: `app/gateway.py` - rewrite routing: parse `model` from request body, route by request → user default → first active, access control via `user_model_access`, 503 response when no model ready

### Phase C: Admin API

- [x] **C1**: `app/admin_api.py` - new endpoints: `GET/POST/PUT/DELETE /admin/api/models/{model_id}`, `/start`, `/stop`, `/toggle`, `/users`, `/export`, `/import`, per-model `/health`, `/config`
- [x] **C2**: `app/admin_api.py` - modify `generate_user_config` to use model's `model_alias`/`context_length` from DB, remove `/profile` and `/profile/switch` endpoints
- [x] **C3**: `app/main.py` - call `ensure_models_sync()` as background task on startup

### Phase D: Infrastructure

- [x] **D1**: `etc/entrypoint.sh` - remove `until curl` wait loop, start uvicorn directly
- [x] **D2**: `docker-compose.yml` - remove model services, keep admin + alloy, mount `models.json`, mount models volume
- [x] **D3**: `alloy/river.alloy` - scrape admin aggregated metrics endpoint with model labels
- [x] **D4**: `deploy.sh` - simplify to `docker compose up -d --build sglang-admin`

### Phase E: Frontend

- [x] **E1**: `frontend/src/api/types.ts` - add `Model` interface, remove `Profile`/`SwitchStatus`/`SwitchResult`
- [x] **E2**: `frontend/src/api/client.ts` - add model CRUD methods, remove profile/switch methods
- [x] **E3**: `frontend/src/pages/ModelsPage.tsx` (new) - full CRUD table, add/edit modal, activate/deactivate, user access, export/import
- [x] **E4**: `frontend/src/pages/SettingsPage.tsx` - remove profile switch section
- [x] **E5**: `frontend/src/pages/UsersPage.tsx` - add default model dropdown, model access column
- [x] **E6**: `frontend/src/components/Layout.tsx` - show active model(s) in navbar with health dots
- [x] **E7**: `frontend/src/hooks/useModelHealth.ts` - per-model health polling
- [x] **E8**: Navigation - add "Models" link to sidebar

### Phase F: Cleanup & Verify

- [x] **F1**: Delete `app/profile_config.py`, `app/docker_orchestrator.py`
- [x] **F2**: Rewrite tests for `docker_manager`, gateway routing, model CRUD
- [x] **F3**: Remove `MODEL_PROFILE` from `.env` and all references
- [x] **F4**: Run `ruff check app/`, `npm run lint`, `pytest`, `vitest run` — all pass (125 backend + 58 frontend tests)

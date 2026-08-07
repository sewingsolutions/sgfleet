# Plan: Profile Switching Orchestration + Generic Model ID

## Overview

Two pieces:
1. Admin dashboard orchestrates `docker compose down/up` to switch model profiles (qwen, gpt, gemma) via Docker socket
2. Single generic model ID (`sglang-api-model`) exposed to end users, so their configs never stale across switches

## Design Decisions

* **Downtime accepted**: ~10-20s admin downtime + 60-120s model load time
* **Generic model ID**: `sglang-api-model` in user configs — always stable across profile switches
* **Exec for durability**: Background switch process uses `os.execvp` to survive container death; status written to shared volume JSON file
* **Shared volume for status/error reporting**: JSON file at `/opt/switch/status.json` survives admin restart
* **No-op rejected**: Switching to current profile returns 400
* **Health polling**: Poll `http://sglang-server:30000/health` until 200 — model is loaded and ready

## Generic Model ID (End Users)

* `sglang-api-model` — fixed ID for all generated configs
* Context length from `settings.model_context_length` — reflects active profile at config generation time
* If admin switches profiles later, configs carry the **old context length** — never breaks, just may not reflect the new upper bound
* User can regenerate config to get current values

## Real Model Info (Admin)

Admin still sees the real model info from SGLang server's `/v1/models`:
* `server_info` endpoint returns `live_model_id`, `live_model_name`, `context_length` from SGLang server — shows what's actually running
* `build_opencode_config` uses generic ID + generic name — never stale
* Admin UI shows real running model info

## Files to Create/Modify

### `docker-compose.yml`
Add volumes to `sglang-admin`:
```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock:ro
  - ./docker-compose.yml:/docker-compose.yml:ro
  - env_file:/env_file:rw      # .env for writing MODEL_PROFILE
  - switch_status:/opt/switch  # shared status file
```
New volume entry at bottom: `switch_status:`

### `sglang-admin/Dockerfile`
```dockerfile
# After pip install, before COPY app/
RUN apt-get update && apt-get install -y --no-install-recommends docker.io && \
    apt-get clean && rm -rf /var/lib/apt/lists/*
# Add volumes
VOLUME ["/opt/switch"]
```

### `sglang-admin/app/docker_orchestrator.py` (new)
Core module for switching model profiles.

`SUPPORTED_PROFILES = {"qwen", "gpt", "gemma"}`

Profile name mapping for admin UI:
```python
PROFILE_NAMES = {
    "qwen": "Qwen 3.6 27B (FP8)",
    "gpt": "gpt-oss 20b (MXFP4)",
    "gemma": "Gemma 4 31B (FP8)",
}
```

`ENV_FILE_PATH = "/env_file/.env"`
`COMPOSE_FILE = "/docker-compose.yml"`
`SWITCH_DIR = "/opt/switch"`

Functions:
* `write_status(stage, target_profile, error=None)` — JSON to `/opt/switch/status.json`
* `read_status()` — parse status file, return dict or None
* `clear_status()` — delete status file
* `get_current_profile()` — parse `.env` for `MODEL_PROFILE`, fallback to `settings.model_profile`
* `update_profile_env(target: str)` — reads `.env`, changes `MODEL_PROFILE=VALUE` line, writes back
* `switch_profile(target_profile)` — orchestrates the switch:
  1. Validates target in SUPPORTED_PROFILES
  2. Gets current profile, rejects no-op
  3. Writes status "starting_down"
  4. Runs `docker compose -f /docker-compose.yml down` — stops all services
  5. Writes status "down_complete"
  6. Updates `.env` MODEL_PROFILE value
  7. Writes status "starting_up"
  8. Runs `docker compose -f /docker-compose.yml up -d --force-recreate` — recreates all
  9. Writes status "up_complete"
  10. Polls `http://sglang-server:30000/health` until 200 or timeout
  11. writes status "ready"
* `switch_background(target_profile)` — forks, execs `docker compose up`, writes final status

### `sglang-admin/app/admin_api.py`
Add to endpoint list:
* `GET /admin/api/settings/server_info` — **NEW**: query `/v1/models` and return `live_model_id` and `live_model_name`
* `GET /admin/api/settings/live_model_info` — returns real model info from SGLang

Modify existing endpoints:
* `build_opencode_config` — uses `model_id: "sglang-api-model"`, `model_name: "SGLang Model"`, `context_length: settings.model_context_length`
* `generate_user_config` — same as above

### `sglang-admin/frontend/src/api/types.ts`
Add:
```ts
export interface SwitchStatus {
  status: 'idle' | 'switching' | 'error' | 'ready'
  stage: string | null
  target_profile: string | null
  error: string | null
}

export interface ProfileInfo {
  name: string
  label: string
  current: boolean
}
```

### `sglang-admin/tests/test_docker_orchestrator.py` (new)
Unit test file:
* `test_supported_profiles` / `test_update_env_file` — reads/writes `.env`, checks `MODEL_PROFILE` preserved
* `test_read_status_unchanged` — file not present returns None
* `test_write_status` — writes JSON, reads back
* `test_no_op_switch` / `test_invalid_profile` — raises ValueError
* `test_switch_profile` — mocks subprocess.run, writes status files, updates `.env`

### `sglang-admin/app/admin_ui.py`
Modify: `build_opencode_config` uses generic model ID, `generate_config` uses generic ID, `generate_user_config` (admin_ui.py:302)

### Execution Order
1. Edit `docker-compose.yml` and `sglang-admin/Dockerfile`
2. Create `sglang-admin/app/docker_orchestrator.py`
3. Edit `sglang-admin/app/admin_api.py` — new endpoints
4. Edit `sglang-admin/frontend/src/api/types.ts` — new types
5. Edit `sglang-admin/frontend/src/api/client.ts` — new API methods
6. Create `sglang-admin/frontend/src/hooks/useReconnection.ts` — reconnect hook
7. Edit `sglang-admin/frontend/src/pages/SettingsPage.tsx` — profile switch UI + reconnect
8. Build and test: `cd sglang-admin && ./deploy.sh`
9. Test profile switching via admin UI
10. Run tests: `cd sglang-admin && python3 -m pytest tests/ -v` and `cd sglang-admin/frontend && npx vitest run`
11. Update `AGENTS.md`

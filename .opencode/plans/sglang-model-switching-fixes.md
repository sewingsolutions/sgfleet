# SGLang Admin: Model Switching Fixes

## Problems

1. **gpt model switch fails**: `--kv-cache-dtype mxfp4` is invalid in current SGLang. The valid option is `fp4_mx_block16`. `mxfp4` is reserved for true MXFP4 block-size-32 semantics and raises a ValueError.
2. **gemma model switch fails**: Image `ghcr.io/tails-mpt/sglang:main` is denied (registry auth issue). Should use official `lmsysorg/sglang:v0.5.16` (gemma4 parsers are supported).
3. **SGLANG_ENDPOINT is static**: Set at admin container startup via env var. After a model switch, the admin still points to the old container's address (e.g., `http://sglang-qwen:30000`). Gateway proxies and admin API endpoints all use `settings.sglang_endpoint` which doesn't update without a restart.
4. **Config generation shows model dropdown**: Users shouldn't pick a model when generating `opencode.json` — all requests go through a single `sglang-api-model` endpoint. The model name should be hardcoded.
5. **Model names inconsistent**: Profile is `qwen`, container is `sglang-qwen3-27b`, model path is `Qwen3.6-27B-FP8`. If Qwen 3.8 arrives, `qwen` profile name is taken and generic.
6. **Model settings (context length, etc.) are static env vars**: After switch, admin has stale `MODEL_CONTEXT_LENGTH` etc. from startup env. Needs dynamic lookup from active profile.

## Plan

### Task 1: Fix gpt profile kv-cache-dtype

**File:** `docker-compose.yml` line 98

Change `--kv-cache-dtype mxfp4` to `--kv-cache-dtype fp4_mx_block16`.

SGLang rejects `mxfp4` with: `invalid choice: 'mxfp4' (choose from 'auto', 'fp8_e5m2', 'fp8_e4m3', 'mxfp8', 'bf16', 'bfloat16', 'nvfp4', 'fp4_mx_block16', 'fp4_e2m1')`.

### Task 2: Fix gemma profile image

**File:** `docker-compose.yml` line 109

Change `image: ghcr.io/tails-mpt/sglang:main` to `image: lmsysorg/sglang:v0.5.16`.

Gemma4 reasoning/tool-call parsers (`--reasoning-parser gemma4`, `--tool-call-parser gemma4`) are confirmed supported in the official image's codebase.

### Task 3: Dynamic SGLANG_ENDPOINT resolution

The admin container resolves `sglang_endpoint` from a startup env var. After a profile switch, it's stale. Solution: read active profile from the status file and look up the endpoint from a profile config mapping at runtime.

**Changes:**

1. **`sglang-admin/app/config.py`** — Add a `PROFILE_ENDPOINTS` mapping (qwen/gpt/gemma → endpoint URL). Remove `sglang_endpoint` from Settings. Add a property `active_sglang_endpoint` that reads the active profile from `docker_orchestrator.get_active_profile()` and returns the corresponding endpoint.

2. **`sglang-admin/app/gateway.py`** — Replace `settings.sglang_endpoint` with a call to the new dynamic resolver in both `proxy_request` (line 175-183) and `passthrough_proxy` (line 241).

3. **`sglang-admin/app/admin_api.py`** — Replace `settings.sglang_endpoint` references (lines 268, 295, 501) with the dynamic resolver.

4. **`docker-compose.yml`** — Remove `SGLANG_ENDPOINT` from admin container environment (line 172).

5. **`sglang-admin/deploy.sh`** — Remove `SGLANG_ENDPOINT` export from each profile case (lines 15, 22, 29).

### Task 4: Dynamic model settings lookup

Similarly, `model_context_length`, `model_max_output_length`, `model_name` are set from env vars at startup. After switch, they're stale.

**Changes:**

1. **`sglang-admin/app/config.py`** — Add `PROFILE_SETTINGS` dict mapping each profile to `{model_name, model_context_length, model_max_output_length}`. Add property that reads active profile and returns current settings.

2. **`sglang-admin/app/admin_api.py`** — In config generation endpoint (line 365), use dynamic settings instead of `settings.model_context_length` etc.

3. **`sglang-admin/deploy.sh`** — Remove `MODEL_PATH`, `MODEL_NAME`, `MODEL_CONTEXT_LENGTH`, `MODEL_MAX_OUTPUT_LENGTH` exports.

4. **`docker-compose.yml`** — Remove corresponding env vars from admin container.

### Task 5: Config generation hardcode model_id

Remove model dropdown from ConfigModal, hardcode model to `sglang-api-model`.

**Changes:**

1. **`sglang-admin/frontend/src/components/ConfigModal.tsx`** — Remove `models` state, `fetchModels`, model `<select>` dropdown (lines 14, 23-34, 90-105). Remove `selectedModel` from `handleGenerate`. Hardcode model_id to `sglang-api-model`.

2. **`sglang-admin/frontend/src/api/client.ts`** — Update `generateConfig` signature to remove `modelId` parameter.

3. **`sglang-admin/app/admin_api.py`** — In `generate_user_config` endpoint (lines 344-371): accept hardcoded `sglang-api-model` as model_id, use dynamic model name from profile config, skip model validation against live SGLang models list. Update `GenerateConfigRequest` to remove `model_id` field.

4. **`build_opencode_config`** — The `model` field in the output should be `sewingsolutionssglang-api-model`. Ensure the config uses the dynamic model name for display.

### Task 6: Consolidate model/profile names

Rename profiles from generic names to specific model identifiers for future-proofing.

**Current → New:**
- `qwen` → `qwen36-27b`
- `gpt` → `gpt-oss-20b`
- `gemma` → `gemma4-31b`

**Files to update:**

1. **`docker-compose.yml`** — Service names, container names, profile names, aliases
2. **`sglang-admin/app/docker_orchestrator.py`** — `VALID_PROFILES` set
3. **`sglang-admin/app/config.py`** — `PROFILE_ENDPOINTS` / `PROFILE_SETTINGS` mapping keys
4. **`sglang-admin/frontend/src/api/types.ts`** — `Profile` type union
5. **`sglang-admin/frontend/src/pages/SettingsPage.tsx`** — `profileLabels` mapping
6. **`sglang-admin/deploy.sh`** — case statement (already being removed, not needed)
7. **`.env`** — `MODEL_PROFILE` value

### Task 7: Run tests and lint

```bash
cd sglang-admin && ruff check app/
cd sglang-admin/frontend && npm run lint
cd sglang-admin && python3 -m pytest tests/ -v
cd sglang-admin/frontend && npx vitest run
```

## Order of execution

1. Task 1 & 2 first (docker-compose.yml fixes, independent)
2. Task 6 next (rename profiles, touches many files but is mechanical)
3. Task 3 & 4 together (dynamic endpoint + dynamic settings share the same profile config mapping)
4. Task 5 (config generation, depends on dynamic model name from task 4)
5. Task 7 last

# Model Download from HuggingFace — Implementation Plan

## Decisions Made

| Decision | Choice | Why |
|---|---|---|
| GPU detection | Dynamic `nvidia-smi` via short-lived CUDA container | Admin container has no GPU passthrough; hardcoded 0-3 is brittle |
| Model browsing | HuggingFace API (`/api/models`) | Official, free, returns params, size, architecture, tags |
| Filter defaults | `pipeline_tag=text-generation`, `safetensors` tag present, gated excluded (unless token set) | SGLang requires safetensors + transformers; only shows LLMs |
| VRAM filter | Exclude models that don't fit; show info message | Prevents wasted downloads |
| Tensor parallelism | Auto-set `--tensor-parallel-size` from GPU count | Correct default; user can edit later in model config |
| Download transport | Short-lived Docker container with RW mount to `MODELS_DIR` | Admin container has `:ro` mount and no GPU access |
| Progress updates | SSE from backend to frontend | Lightweight, unidirectional, real-time |
| Disk check | Pre-download check on `MODELS_DIR` | Fails fast with clear message |
| Existing files | Skip download, show warning | Idempotent, no data loss |
| Failed downloads | User-initiated cleanup button | Partial files may be inspectable; user decides |
| Post-download | Auto-create model config with pre-filled defaults from HF metadata | Reduces manual steps |
| Config route | `/admin/models/download` (sub-route of Models page) | Logical grouping, breadcrumb + back nav |
| HF token | Env var + SettingsPage UI input | Flexibility; gated models gated behind token |
| Concurrent downloads | One at a time | Simplicity, avoids disk/GPU contention |

## New Environment Variable

- **`MODELS_DIR`** — configurable model storage path (default: `YOUR_MODELS_PATH/vllm_models`)
- **`HUGGINGFACE_TOKEN`** — optional HF API token for gated models

## Affected Files — Backend (Python)

| File | Change |
|---|---|
| `admin/app/admin_api.py` | New endpoints: list GPUs, search HF models, start/poll/cancel download, check path exists, cleanup partial, get/set HF token, check disk space |
| `admin/app/db.py` | Persist `hf_api_token` in settings table |
| `admin/Dockerfile` | Add `huggingface_hub` to `requirements.txt` |
| `docker-compose.yml` | Add `MODELS_DIR` env var; add RW volume mount for model downloads |
| `admin/etc/entrypoint.sh` | Pass `MODELS_DIR` env to Python app |

## Affected Files — Frontend (TypeScript/React)

| File | Change |
|---|---|
| `admin/frontend/src/App.tsx` | New route: `/models/download` → `ModelDownloadPage` |
| `admin/frontend/src/api/types.ts` | New types: `GPUInfo`, `HFModel`, `DownloadJob`, `DiskUsage` |
| `admin/frontend/src/api/client.ts` | New API methods for GPU, HF search, download, cleanup, token, disk |
| `admin/frontend/src/pages/ModelsPage.tsx` | Add "Download Model" button linking to `/models/download` |
| `admin/frontend/src/pages/ModelDownloadPage.tsx` | **New**: full download UI — GPU info, search, filter, model cards, detail view, GPU selector, download form, progress bar, completion |
| `admin/frontend/src/pages/SettingsPage.tsx` | Add HF API Token field |

## Affected Files — Config

| File | Change |
|---|---|
| `.env.example` | Add `MODELS_DIR` and `HUGGINGFACE_TOKEN` |
| `.env` | Add `MODELS_DIR` and `HUGGINGFACE_TOKEN` |

## Implementation Order

1. ✅ **Env + config layer** — Add `MODELS_DIR` to `.env`, `docker-compose.yml`, propagate to Python app
2. ✅ **Backend: GPU detection** — API endpoint that runs a short-lived `nvidia-smi` container, returns GPU count, names, and VRAM
3. ✅ **Backend: HF search** — API endpoint that proxies to HF API, applies filters (text-generation, safetensors, gated, VRAM), returns model list
4. ✅ **Backend: Download engine** — SSE endpoint; launches short-lived container with `huggingface-cli download`; streams progress; handles disk check, path exists, cleanup
5. ✅ **Backend: HF token storage** — Get/set endpoint, persisted to DB
6. ✅ **Backend: Auto-create model config** — On download success, create model entry in DB with pre-filled defaults from HF metadata
7. ✅ **Frontend: Types + API client** — Add types and client methods
8. ✅ **Frontend: ModelDownloadPage** — Build the full page: GPU info banner, HF token prompt (if missing), search bar, filter sidebar, model list/cards, detail view with GPU selector, download button, progress bar, completion state
9. ✅ **Frontend: ModelsPage integration** — Add "Download Model" button/link
10. ✅ **Frontend: SettingsPage** — Add HF token field
11. ✅ **Lint** — All lint checks pass
12. ✅ **Test** — All 191 tests pass (130 backend + 61 frontend)

## VRAM Estimation Formula

From HF API `safetensors.parameters`:
- `BF16` / `F16`: 2 bytes × params
- `FP8` / `F8_E5M2`: 1 byte × params
- `FP4`: 0.5 bytes × params
- Plus ~15% overhead for KV cache, activations, and framework overhead

UI info message: *"Models requiring more than X GB are hidden."*

## Known Risks

- **HuggingFace API rate limits**: Free API is rate-limited (~100 req/min unauthenticated). Backend should cache recent results and add rate-limit backoff.
- **Large downloads**: A 30B FP8 model is ~30GB. Downloads may take 10-30+ minutes. SSE connection must survive long durations.
- **Container cleanup**: If admin restarts mid-download, helper container dies and partial files remain. The cleanup button addresses this.
- **SGLang compatibility**: Not all `pipeline_tag=text-generation` models work with SGLang. The auto-created config may need manual tuning. The existing "Test" button in ModelsPage can validate.

## Remaining Assumptions

- `huggingface-cli` is available in the SGLang docker image (`lmsysorg/sglang`), or we use a dedicated `huggingface/hub` image for downloads
- The Docker socket on the host allows running containers with `--gpus all`
- `MODELS_DIR` is writable by the Docker user running helper containers

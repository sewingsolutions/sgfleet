import asyncio
import contextlib
import logging
import os
import shutil
import time
from urllib.parse import urlencode

import httpx
from huggingface_hub import snapshot_download

from .docker_manager import CONTAINER_MODELS_DIR, ModelError, _run

logger = logging.getLogger(__name__)

HF_API_BASE = "https://huggingface.co/api/models"

_search_cache: dict[str, dict] = {}
_cache_times: dict[str, float] = {}
CACHE_DURATION = 300


def estimate_vram_gb(safetensors: dict | None) -> float:
    if not safetensors or "parameters" not in safetensors:
        return 0.0
    total_bytes = 0
    params = safetensors["parameters"]
    for dtype, count in params.items():
        dtype_upper = dtype.upper()
        if "FP4" in dtype_upper or "F4" in dtype_upper:
            total_bytes += count * 0.5
        elif "FP8" in dtype_upper or "F8" in dtype_upper:
            total_bytes += count * 1
        elif "BF16" in dtype_upper or "F16" in dtype_upper or "FP16" in dtype_upper:
            total_bytes += count * 2
        elif "INT8" in dtype_upper or "I8" in dtype_upper:
            total_bytes += count * 1
        elif "INT4" in dtype_upper or "I4" in dtype_upper:
            total_bytes += count * 0.5
        else:
            total_bytes += count * 2
    total_gb = total_bytes / (1024**3)
    total_gb *= 1.15
    return round(total_gb, 2)


async def detect_gpus() -> list[dict]:
    try:
        out = await _run(
            [
                "nvidia-smi",
                "--query-gpu=index,name,memory.total",
                "--format=csv,noheader,nounits",
            ]
        )
    except (ModelError, FileNotFoundError):
        try:
            out = await _run(
                [
                    "docker",
                    "run",
                    "--rm",
                    "--gpus",
                    "all",
                    "nvidia/cuda:12.6.0-base-ubuntu22.04",
                    "nvidia-smi",
                    "--query-gpu=index,name,memory.total",
                    "--format=csv,noheader,nounits",
                ]
            )
        except ModelError as e:
            logger.warning("GPU detection failed: %s", e)
            return []

    gpus = []
    for line in out.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = [p.strip() for p in line.split(",", 2)]
        if len(parts) >= 3:
            with contextlib.suppress(ValueError, IndexError):
                gpus.append(
                    {
                        "index": int(parts[0]),
                        "name": parts[1],
                        "vram_mb": int(parts[2]),
                        "vram_gb": round(int(parts[2]) / 1024, 1),
                    }
                )
    return gpus


async def search_hf_models(
    query: str = "",
    max_vram_gb: float | None = None,
    has_token: bool = False,
    limit: int = 50,
) -> dict:
    cache_key = f"{query}:{max_vram_gb}:{has_token}:{limit}"
    now = time.time()
    cached_entry = _search_cache.get(cache_key)
    if cached_entry and now - _cache_times.get(cache_key, 0) < CACHE_DURATION:
        return cached_entry

    params: dict[str, object] = {
        "pipeline_tag": "text-generation",
        "sort": "downloads",
        "direction": "-1",
        "limit": limit,
    }
    if query:
        params["search"] = query

    headers = {}
    token = os.environ.get("HUGGINGFACE_TOKEN", "")
    if token:
        has_token = True
        headers["Authorization"] = f"Bearer {token}"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            url = f"{HF_API_BASE}?{urlencode(params)}"
            resp = await client.get(url, headers=headers)
            if resp.status_code != 200:
                raise ModelError(f"HF API returned {resp.status_code}")
            raw = resp.json()
    except (httpx.RequestError, ModelError) as e:
        logger.warning("HF search failed: %s", e)
        return {"models": [], "hidden_by_vram": 0}

    async def fetch_safetensors(model_id: str) -> dict | None:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(f"{HF_API_BASE}/{model_id}", headers=headers)
                if resp.status_code == 200:
                    info = resp.json()
                    st = info.get("safetensors")
                    if st and st.get("parameters"):
                        return st
        except (httpx.RequestError, Exception):
            pass
        return None

    st_cache: dict[str, dict] = {}
    filtered = []
    for m in raw:
        if not has_token and m.get("gated") and m["gated"] != "auto":
            continue
        tags = m.get("tags", [])
        if "safetensors" not in tags:
            continue
        filtered.append(m)

    if filtered:
        tasks = [fetch_safetensors(m["id"]) for m in filtered]
        fetched = await asyncio.gather(*tasks, return_exceptions=True)
        for m, result in zip(filtered, fetched, strict=True):
            if isinstance(result, dict):
                st_cache[m["id"]] = result

    results = []
    hidden_count = 0
    for m in filtered:
        safetensors = st_cache.get(m["id"])
        vram = estimate_vram_gb(safetensors)
        if max_vram_gb and vram > max_vram_gb:
            hidden_count += 1
            continue
        results.append(
            {
                "id": m["id"],
                "author": m.get("author", ""),
                "likes": m.get("likes", 0),
                "downloads": m.get("downloads", 0),
                "vram_gb": vram,
                "parameters": safetensors.get("parameters", {}) if safetensors else {},
                "total_params": sum(safetensors.get("parameters", {}).values()) if safetensors else 0,
                "storage_bytes": m.get("usedStorage", 0),
                "library": m.get("library_name", ""),
                "tags": (m.get("tags") or [])[:20],
                "gated": m.get("gated", False),
                "last_modified": m.get("lastModified", ""),
                "config": m.get("config", {}),
                "architectures": (m.get("config") or {}).get("architectures", []),
            }
        )

    result = {"models": results, "hidden_by_vram": hidden_count}
    _search_cache[cache_key] = result
    _cache_times[cache_key] = now

    return result


async def check_disk_space() -> dict:
    stat = os.statvfs(CONTAINER_MODELS_DIR)
    free_bytes = stat.f_bavail * stat.f_frsize
    total_bytes = stat.f_blocks * stat.f_frsize
    return {
        "free_bytes": free_bytes,
        "free_gb": round(free_bytes / (1024**3), 1),
        "total_gb": round(total_bytes / (1024**3), 1),
    }


async def check_model_path_exists(target_dir: str) -> bool:
    if not os.path.isdir(target_dir):
        return False
    entries = os.listdir(target_dir)
    has_weights = any(f.endswith(".safetensors") or f.endswith(".bin") for f in entries)
    has_config = "config.json" in entries
    return has_weights and has_config


async def cleanup_model_path(target_dir: str) -> bool:
    if os.path.exists(target_dir):
        shutil.rmtree(target_dir)
        logger.info("Cleaned up: %s", target_dir)
        return True
    return False


async def run_download(
    model_id: str,
    target_dir: str,
    token: str,
    progress_fn=None,
) -> None:
    # Resolve relative target_dir against container MODELS_DIR
    if not os.path.isabs(target_dir):
        target_dir = os.path.join(CONTAINER_MODELS_DIR, target_dir)

    include_patterns = {
        "*.safetensors",
        "*.bin",
        "config.json",
        "tokenizer.json",
        "tokenizer.model",
        "vocab.json",
        "merges.txt",
        "generation_config.json",
        "*.txt",
        "README.md",
    }

    def _download_sync():
        snapshot_download(
            repo_id=model_id,
            repo_type="model",
            local_dir=target_dir,
            allow_patterns=list(include_patterns),
            token=token or None,
            local_dir_use_symlinks=False,
        )

    try:
        await asyncio.to_thread(_download_sync)
    except Exception as exc:
        raise ModelError(f"Download failed: {exc}") from exc


def generate_model_config(hf_model: dict, target_dir: str, gpu_indices: list[int]) -> dict:
    model_id_raw = hf_model["id"]
    short_id = model_id_raw.split("/")[-1].lower().replace(".", "-").replace("_", "-")[:30]
    name = short_id.replace("-", " ").title()
    for word in ["FP8", "FP4", "BF16", "INT8", "INT4"]:
        if word in hf_model.get("tags", []):
            name += f" ({word})"
            break

    gpu_str = ",".join(str(g) for g in gpu_indices) if gpu_indices else None
    tp_size = len(gpu_indices) if gpu_indices else 1
    flags = []
    if tp_size > 1:
        flags.extend(["--tensor-parallel-size", str(tp_size)])

    context_length = 4096
    max_output_length = 4096
    if hf_model.get("config"):
        try:
            max_pos = hf_model["config"].get("max_position_embeddings")
            if max_pos:
                context_length = int(max_pos)
        except (TypeError, ValueError):
            pass

    # Preserve full relative path under CONTAINER_MODELS_DIR for model_path
    rel_path = os.path.relpath(target_dir, CONTAINER_MODELS_DIR)
    return {
        "model_id": short_id,
        "name": name,
        "image": "lmsysorg/sglang:v0.5.16",
        "model_path": f"/models/{rel_path}",
        "context_length": min(context_length, 131072),
        "max_output_length": max_output_length,
        "port": 30000,
        "container_name": f"sgfleet-{short_id}",
        "container_alias": f"sgfleet-{short_id}",
        "model_alias": "sgfleet-api-model",
        "active": False,
        "grace_period": 10,
        "environment": {},
        "gpu": gpu_str if gpu_str and len(gpu_indices) == 1 else None,
        "command_flags": flags,
    }


async def get_hf_token() -> str:
    from .db import get_db

    token = os.environ.get("HUGGINGFACE_TOKEN", "")
    if token:
        return token
    try:
        async with get_db() as db, db.execute("SELECT value FROM config WHERE key = 'hf_api_token'") as cursor:
            row = await cursor.fetchone()
            if row:
                return row[0]
    except Exception:
        pass
    return ""


async def set_hf_token(token: str) -> None:
    from .db import get_db

    async with get_db() as db:
        await db.execute("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", ("hf_api_token", token))
        await db.commit()

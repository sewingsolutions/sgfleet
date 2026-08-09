import asyncio
import contextlib
import logging
import os
import queue
import shutil
import time
from urllib.parse import urlencode

import httpx

from .docker_manager import CONTAINER_MODELS_DIR, CONTAINER_MODELS_DIR_RW, ModelError, _run

logger = logging.getLogger("sgfleet-admin")

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
    gated_cache: dict[str, bool] = {}

    # Check if a gated model is actually accessible with current token
    async def check_accessible(model_id: str) -> None:
        if model_id in gated_cache:
            return
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"{HF_API_BASE}/{model_id}", headers=headers)
                gated_cache[model_id] = resp.status_code == 200
        except Exception:
            gated_cache[model_id] = False

    filtered = []
    for m in raw:
        if not has_token and m.get("gated") and m["gated"] != "auto":
            continue
        tags = m.get("tags", [])
        if "safetensors" not in tags:
            continue
        filtered.append(m)

    # Check gated model accessibility in parallel
    if filtered and has_token:
        gated_ids = [m["id"] for m in filtered if m.get("gated")]
        if gated_ids:
            await asyncio.gather(*[check_accessible(mid) for mid in gated_ids], return_exceptions=True)
            filtered = [m for m in filtered if not m.get("gated") or gated_cache.get(m["id"], True)]

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
    stat = os.statvfs(CONTAINER_MODELS_DIR_RW)
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


def _dir_size(path: str) -> int:
    total = 0
    if not os.path.isdir(path):
        return 0
    try:
        for dirpath, _, filenames in os.walk(path):
            for f in filenames:
                with contextlib.suppress(OSError):
                    total += os.path.getsize(os.path.join(dirpath, f))
    except OSError:
        pass
    return total


async def run_download(
    model_id: str,
    target_dir: str,
    token: str,
    progress_queue: queue.Queue | None = None,
    expected_bytes: int = 0,
) -> None:
    from huggingface_hub import HfApi, hf_hub_download

    logger.info(
        "DOWNLOAD START model_id=%s target_dir=%s token=%s expected_bytes=%d",
        model_id,
        target_dir,
        bool(token),
        expected_bytes,
    )

    # Resolve relative target_dir against container MODELS_DIR (use RW mount for downloads)
    if not os.path.isabs(target_dir):
        target_dir = os.path.join(CONTAINER_MODELS_DIR_RW, target_dir)
    logger.info("DOWNLOAD resolved target_dir=%s", target_dir)

    os.makedirs(target_dir, exist_ok=True)

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

    def _matches(p: str) -> bool:
        base = os.path.basename(p)
        for pat in include_patterns:
            if pat == base:
                return True
            if pat.startswith("*.") and base.endswith(pat[1:]):
                return True
        return False

    api = HfApi()

    def _list_and_download():
        # 1) Get file list from HF
        if progress_queue:
            progress_queue.put("Listing files on HuggingFace...")
        logger.info("DOWNLOAD listing files for %s", model_id)

        all_files = list(api.list_repo_files(repo_id=model_id, repo_type="model", token=token or None))
        logger.info("DOWNLOAD found %d total files in repo", len(all_files))
        files_to_download = [f for f in all_files if _matches(f)]
        logger.info("DOWNLOAD %d files match download patterns", len(files_to_download))

        if not files_to_download:
            msg = f"No matching files found in {model_id}"
            logger.error("DOWNLOAD %s", msg)
            raise ModelError(msg)

        if progress_queue:
            progress_queue.put(f"Found {len(files_to_download)} files to download")

        # 2) Get sizes for each file
        if progress_queue:
            progress_queue.put("Getting file sizes...")
        logger.info("DOWNLOAD getting file sizes for %d files", len(files_to_download))

        file_sizes: list[tuple[str, int]] = []
        total_size = 0
        for fp in files_to_download:
            try:
                info = api.get_paths_info(repo_id=model_id, paths=[fp], repo_type="model", token=token or None)
                size = getattr(info[0], "size", 0) if info else 0
            except Exception as e:
                logger.warning("DOWNLOAD get_paths_info failed for %s: %s", fp, e)
                size = 0
            file_sizes.append((fp, size))
            total_size += size

        logger.info("DOWNLOAD total_size=%d (%.1fGB)", total_size, total_size / (1024**3))
        if total_size > 0 and progress_queue:
            gb = total_size / (1024**3)
            progress_queue.put(f"Total size: {gb:.1f}GB ({len(file_sizes)} files)")

        # 3) Download each file, track progress
        on_disk = 0
        for i, (fp, _size) in enumerate(file_sizes):
            logger.info("DOWNLOAD [%d/%d] downloading %s", i + 1, len(file_sizes), fp)
            if progress_queue:
                progress_queue.put(f"Downloading {fp}...")
            try:
                start_t = time.time()
                hf_hub_download(
                    repo_id=model_id,
                    filename=fp,
                    repo_type="model",
                    local_dir=target_dir,
                    token=token or None,
                )
                elapsed = time.time() - start_t
                # Verify file actually exists after download
                # Handle subdirectories - hf_hub_download may create subdirs
                local_fp = os.path.join(target_dir, fp)
                if os.path.exists(local_fp):
                    actual_size = os.path.getsize(local_fp)
                    logger.info(
                        "DOWNLOAD [%d/%d] %s done in %.1fs (%.1fMB)",
                        i + 1,
                        len(file_sizes),
                        fp,
                        elapsed,
                        actual_size / (1024**2),
                    )
                else:
                    logger.warning(
                        "DOWNLOAD [%d/%d] %s: file not found at %s after download", i + 1, len(file_sizes), fp, local_fp
                    )

            except Exception as e:
                logger.error("DOWNLOAD [%d/%d] failed for %s: %s", i + 1, len(file_sizes), fp, e)
                raise ModelError(f"Failed to download {fp}: {e}") from e

            # Recalculate on-disk size after each file
            on_disk = _dir_size(target_dir)
            logger.info("DOWNLOAD [%d/%d] on_disk=%d (%.1fGB)", i + 1, len(file_sizes), on_disk, on_disk / (1024**3))
            if progress_queue:
                if total_size > 0:
                    pct = min(99, int(on_disk / total_size * 100))
                else:
                    pct = int((i + 1) / len(file_sizes) * 100)
                mb = on_disk / (1024 * 1024)
                gb = on_disk / (1024**3)
                if on_disk < 1024**3:
                    progress_queue.put(f"[{i + 1}/{len(file_sizes)}] {pct}% {mb:.1f}MB")
                else:
                    progress_queue.put(f"[{i + 1}/{len(file_sizes)}] {pct}% {gb:.1f}GB")

        return on_disk

    try:
        final_size = await asyncio.to_thread(_list_and_download)
        logger.info("DOWNLOAD asyncio.to_thread completed final_size=%d", final_size)
    except ModelError:
        logger.exception("DOWNLOAD ModelError during download")
        raise
    except Exception as exc:
        logger.exception("DOWNLOAD unhandled exception during download: %s", exc)
        raise ModelError(f"Download failed: {exc}") from exc

    # Final validation
    logger.info("DOWNLOAD final validation for %s", target_dir)
    if not os.path.isdir(target_dir):
        msg = f"Download completed but target directory not found: {target_dir}"
        logger.error("DOWNLOAD %s", msg)
        raise ModelError(msg)
    entries = os.listdir(target_dir)
    logger.info("DOWNLOAD target_dir entries: %s", entries[:20])
    has_weights = any(f.endswith(".safetensors") or f.endswith(".bin") for f in entries)
    if not has_weights:
        msg = (
            f"Download completed but no weight files (.safetensors/.bin) found in {target_dir}. "
            f"Files found: {entries[:10]}"
        )
        logger.error("DOWNLOAD %s", msg)
        raise ModelError(msg)

    if progress_queue:
        gb = final_size / (1024**3)
        mb = final_size / (1024 * 1024)
        if final_size < 1024**3:
            progress_queue.put(f"Done! Downloaded {mb:.1f}MB ({len(entries)} files)")
        else:
            progress_queue.put(f"Done! Downloaded {gb:.1f}GB ({len(entries)} files)")

    logger.info("DOWNLOAD SUCCESS model_id=%s final_size=%d entries=%d", model_id, final_size, len(entries))


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

    # Extract relative model path from target_dir (works with both /models and /downloads mount)
    rel_path = os.path.relpath(target_dir, CONTAINER_MODELS_DIR_RW)
    if rel_path.startswith(".."):
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


async def get_sgfleet_base_url() -> str:
    from .db import get_db

    async with get_db() as db, db.execute("SELECT value FROM config WHERE key = 'sgfleet_base_url'") as cursor:
        row = await cursor.fetchone()
        if row:
            return row[0]
    return "http://localhost:8000/v1"


async def set_sgfleet_base_url(url: str) -> None:
    from .db import get_db

    async with get_db() as db:
        await db.execute("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", ("sgfleet_base_url", url))
        await db.commit()

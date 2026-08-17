import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager, suppress

from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import Response, StreamingResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from . import audit as audit_log
from . import log_store
from . import metrics as real_metrics
from .admin_api import router as admin_api_router
from .admin_ui import router as admin_ui_router
from .db import get_all_models, get_db, init_db
from .docker_manager import ensure_models_sync
from .gateway import authenticate_user, create_gateway_router, create_passthrough_router, httpx_passthrough, httpx_pool
from .logging import setup_logging
from .metrics_api import router as metrics_api_router
from .model_registry import mark_not_ready, mark_ready, reload_cache, set_ready_ids
from .prometheus_metrics import handler as prometheus_handler
from .user_api import router as user_api_router

logger = setup_logging()

_metrics_cleanup_task = None
_audit_cleanup_task = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _metrics_cleanup_task, _audit_cleanup_task
    await init_db()

    # Rotate model container logs on startup
    from .docker_manager import run_logrotate

    asyncio.create_task(run_logrotate())

    from .db import is_setup_complete, load_admin_api_key

    setup_done = await is_setup_complete()

    if setup_done:
        from .config import settings

        admin_key = await load_admin_api_key()
        settings.admin_api_key = admin_key
        asyncio.create_task(_start_model_sync())
    else:
        logger.info("Setup not complete — skipping model sync. Complete setup at /admin/setup")

    # Restore persisted log level
    from .logging import set_logger_level

    async with get_db() as db, db.execute("SELECT value FROM config WHERE key = ?", ("admin_log_level",)) as cursor:
        row = await cursor.fetchone()
        if row:
            set_logger_level(logger, row[0])

    # Start log persistence thread
    await log_store.start_persistence(logger)

    _metrics_cleanup_task = asyncio.create_task(real_metrics.cleanup())
    _audit_cleanup_task = asyncio.create_task(audit_log.cleanup())
    yield
    for t in (_metrics_cleanup_task, _audit_cleanup_task):
        if t:
            t.cancel()
            with suppress(asyncio.CancelledError):
                await t
    await httpx_pool.aclose()
    await httpx_passthrough.aclose()


class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint):
        start = time.monotonic()
        request_id = request.headers.get("x-request-id", "")
        ip = (request.client and request.client.host) or ""
        if request.url.path.startswith("/v1/"):
            user = await authenticate_user(request)
            user_name = user["name"] if user else None
        else:
            user = None
            user_name = None

        try:
            response = await call_next(request)
        except Exception as exc:
            latency = (time.monotonic() - start) * 1000
            _emit_log(request, request_id, 500, latency, user_name, ip, error=str(exc), level=logging.INFO)
            raise

        status = response.status_code

        if isinstance(response, StreamingResponse):
            original_body = response.body_iterator

            async def wrapped_body():
                try:
                    async for chunk in original_body:
                        yield chunk
                finally:
                    latency = (time.monotonic() - start) * 1000
                    _emit_log(request, request_id, status, latency, user_name, ip)

            return StreamingResponse(
                wrapped_body(),
                status_code=response.status_code,
                headers=dict(response.headers),
                media_type=response.media_type,
            )

        latency = (time.monotonic() - start) * 1000
        _emit_log(request, request_id, status, latency, user_name, ip)
        return response


def _emit_log(request, request_id, status, latency, user_name, ip, error=None, level=None):
    is_success = 200 <= status < 400 and not error
    lvl = level or (logging.DEBUG if is_success else logging.INFO)

    extra = {
        "request": {
            "event": "request",
            "method": request.method,
            "path": request.url.path,
            "status": status,
            "latency_ms": latency,
            "user": user_name,
            "request_id": request_id,
            "ip": ip,
        }
    }
    if error:
        extra["request"]["error"] = error
    logger.log(lvl, "", extra=extra)


async def _start_model_sync():
    """Sync model containers on startup.

    Populates the model registry cache and marks only models whose health probe
    succeeded as ready so the gateway will not route to a container that is
    still loading or missing from the docker network.
    """
    try:
        await asyncio.sleep(1)
        models = await get_all_models()
        # Heal stale model_path values that point at the host directory
        # (e.g. "YOUR_MODELS_PATH/vllm_models/foo") instead of the in-container
        # "/models/foo". These entries can be created by older admin versions
        # and would cause sglang to hand the string to HuggingFace as a repo id.
        try:
            from .db import update_model as _update_model_path

            for _m in models:
                _mp = _m.get("model_path") or ""
                if _mp.startswith("/") and not _mp.startswith("/models/"):
                    _fixed = f"/models/{os.path.basename(_mp.rstrip('/'))}"
                    logger.warning(
                        "Rewriting stale model_path for %s: %s -> %s",
                        _m.get("model_id"),
                        _mp,
                        _fixed,
                    )
                    await _update_model_path(_m["model_id"], {"model_path": _fixed})
                    _m["model_path"] = _fixed
        except Exception as e:  # pragma: no cover - defensive
            logger.warning("model_path self-heal skipped: %s", e)
        # Load the cache first so admin API responses have model metadata even
        # while containers are still coming up.
        await reload_cache()
        # Clear ready set before sync - on fresh startup it's already empty,
        # but this ensures stale state from a previous run is cleared.
        set_ready_ids(set())
        if models:
            # Use incremental mark_ready so models become routable as soon as
            # they pass their health check, rather than waiting for all models
            # to complete. This minimizes the 503 window during startup.
            ready = await ensure_models_sync(models, mark_ready_fn=mark_ready, mark_not_ready_fn=mark_not_ready)
            # Refresh cache in case sync mutated status/metadata.
            await reload_cache()
            logger.info(
                "Model sync completed. Ready models: %s",
                sorted(ready) or "<none>",
            )
        else:
            logger.info("Model sync completed. No models configured.")
    except Exception as e:
        logger.error("Model sync failed: %s", e)


app = FastAPI(title="SGFleet", lifespan=lifespan)
app.add_middleware(LoggingMiddleware)

# Gateway and passthrough routes first
app.include_router(create_passthrough_router())
app.include_router(create_gateway_router())

# Admin API routes (must be before UI catch-all)
app.include_router(admin_api_router)
app.include_router(metrics_api_router)

# Prometheus metrics endpoint for Alloy scraping (MUST be before UI catch-all)
prom_router = APIRouter()


@prom_router.get("/api/metrics")
def prometheus_metrics():
    body, content_type = prometheus_handler()
    return Response(content=body, media_type=content_type)


app.include_router(prom_router)

app.include_router(admin_ui_router)
app.include_router(user_api_router)

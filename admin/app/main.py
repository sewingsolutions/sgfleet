import asyncio
import logging
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
from .model_registry import reload_cache, set_ready_ids
from .prometheus_metrics import handler as prometheus_handler

logger = setup_logging()

_metrics_cleanup_task = None
_audit_cleanup_task = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _metrics_cleanup_task, _audit_cleanup_task
    await init_db()

    # Start model sync in background
    asyncio.create_task(_start_model_sync())

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
        user = await authenticate_user(request)
        user_name = user["name"] if user else None
        ip = (request.client and request.client.host) or ""

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
        # Load the cache first so admin API responses have model metadata even
        # while containers are still coming up. The ready set (empty by default)
        # keeps the gateway from routing to them prematurely.
        await reload_cache()
        set_ready_ids(set())
        if models:
            ready = await ensure_models_sync(models)
            # Refresh cache in case sync mutated status/metadata.
            await reload_cache()
            set_ready_ids(ready)
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


@prom_router.get("/admin/api/metrics")
def prometheus_metrics():
    body, content_type = prometheus_handler()
    return Response(content=body, media_type=content_type)


app.include_router(prom_router)

# Admin UI routes (login, logout, SPA fallback) - includes metrics SPA page
app.include_router(admin_ui_router)

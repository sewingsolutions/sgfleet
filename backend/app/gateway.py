import asyncio
import json
import logging
import socket
import time
import uuid

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse

from . import audit as audit_log
from . import metrics as real_metrics
from . import webhooks as webhook_notify
from .db import get_user_by_token, get_user_model_access
from .model_registry import (
    get_active_models_cached,
    get_cached_active_endpoint,
    get_endpoint,
    get_model_cached,
    is_ready,
    mark_not_ready,
)
from .prometheus_metrics import (
    active_connections,
    auth_failures,
    concurrent_limit_rejections,
    rate_limit_rejections,
    request_latency,
    total_requests,
    upstream_status,
)
from .token_parser import extract_usage_from_body, extract_usage_from_sse

_gateway_logger = logging.getLogger("sgfleet-admin")

httpx_pool = httpx.AsyncClient(
    timeout=300.0,
    limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
)
httpx_passthrough = httpx.AsyncClient(
    timeout=30.0,
    limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
)


def _get_bearer_token(request: Request) -> str | None:
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return None


def _get_x_api_key(request: Request) -> str | None:
    x_api_key = request.headers.get("x-api-key", "")
    return x_api_key or None


async def authenticate_user(request: Request):
    token = _get_bearer_token(request) or _get_x_api_key(request)
    if not token:
        return None
    user = await get_user_by_token(token)
    return user


_concurrent_locks = {}
_concurrent_counts = {}


async def acquire_concurrent_slot(user: dict) -> bool:
    name = user["name"]
    if name not in _concurrent_locks:
        _concurrent_locks[name] = asyncio.Lock()
        _concurrent_counts[name] = 0
    async with _concurrent_locks[name]:
        if _concurrent_counts[name] >= user["max_concurrent"]:
            return False
        _concurrent_counts[name] += 1
        active_connections.labels(name).set(1)
    return True


def release_concurrent_slot(user: dict):
    name = user["name"]
    _concurrent_counts[name] = max(0, _concurrent_counts[name] - 1)
    active_connections.labels(name).set(0)


_rate_buckets = {}


def _init_bucket(name: str, rate: float):
    if name not in _rate_buckets:
        _rate_buckets[name] = {
            "tokens": rate * 10,
            "last_refill": time.monotonic(),
            "rate": rate,
        }


def _refill_bucket(name: str):
    now = time.monotonic()
    bucket = _rate_buckets[name]
    elapsed = now - bucket["last_refill"]
    bucket["tokens"] = min(bucket["rate"] * 10, bucket["tokens"] + elapsed * bucket["rate"])
    bucket["last_refill"] = now


async def consume_rate_token(user: dict) -> bool:
    name = user["name"]
    _init_bucket(name, user["rate_limit"])
    _refill_bucket(name)
    if _rate_buckets[name]["tokens"] < 1:
        return False
    _rate_buckets[name]["tokens"] -= 1
    return True


async def handle_options():
    return Response(
        status_code=204,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Request-ID",
            "Access-Control-Expose-Headers": "X-Request-ID",
        },
    )


def _extract_model_from_body(body: bytes) -> str | None:
    try:
        data = json.loads(body)
        return data.get("model")
    except (json.JSONDecodeError, ValueError, TypeError):
        return None


def _is_dns_failure(exc: BaseException) -> bool:
    """Detect httpx.ConnectError caused by DNS resolution failure."""
    cur: BaseException | None = exc
    while cur is not None:
        if isinstance(cur, socket.gaierror):
            return True
        cur = cur.__cause__ or cur.__context__
    msg = str(exc).lower()
    return "name resolution" in msg or "name or service not known" in msg or "nodename nor servname" in msg


def _determine_target_endpoint(body: bytes) -> tuple[str | None, str | None]:
    request_model = _extract_model_from_body(body)
    if request_model:
        model_info = get_model_cached(request_model)
        if model_info and model_info.get("active") and is_ready(request_model):
            endpoint = get_endpoint(request_model)
            if endpoint:
                return (endpoint, request_model)
    active_models = get_active_models_cached()
    if active_models:
        first = active_models[0]
        endpoint = get_endpoint(first["model_id"])
        return (endpoint, first["model_id"]) if endpoint else (None, first["model_id"])
    return (None, None)


_ANTHROPIC_ERROR_TYPES = {
    401: "authentication_error",
    429: "rate_limit_error",
    502: "api_error",
    503: "api_error",
}


def _anthropic_error_body(status_code: int, message: str) -> dict:
    return {"type": "error", "error": {"type": _ANTHROPIC_ERROR_TYPES[status_code], "message": message}}


def _rejection_body(request: Request, status_code: int, message: str, default_body) -> dict:
    if request.url.path == "/v1/messages" and status_code in _ANTHROPIC_ERROR_TYPES:
        return _anthropic_error_body(status_code, message)
    return default_body


async def proxy_request(request: Request):
    from .db import is_setup_complete

    if not await is_setup_complete():
        return JSONResponse(
            status_code=503,
            content=_rejection_body(
                request,
                503,
                "System setup not complete",
                {
                    "error": {
                        "message": "System setup not complete",
                        "type": "setup_required",
                        "code": "setup_required",
                    }
                },
            ),
        )

    user = await authenticate_user(request)
    request_id = str(uuid.uuid4())
    if not user:
        auth_failures.inc()
        total_requests.labels(request.method, request.url.path, "401", "unknown").inc()
        _gateway_logger.log(
            logging.INFO,
            "",
            extra={
                "request": {
                    "event": "gateway_rejection",
                    "method": request.method,
                    "path": request.url.path,
                    "status": 401,
                    "latency_ms": 0,
                    "user": "unknown",
                    "request_id": request_id,
                    "ip": (request.client and request.client.host) or "unknown",
                    "error": "missing_api_key",
                }
            },
        )
        return JSONResponse(
            status_code=401,
            content=_rejection_body(
                request, 401, "Invalid or missing API key", {"detail": "Invalid or missing API key"}
            ),
            headers={"X-Request-ID": request_id},
        )

    if not await consume_rate_token(user):
        rate_limit_rejections.labels(user["name"]).inc()
        real_metrics.add_user_429(user["name"])
        total_requests.labels(request.method, request.url.path, "429", user["name"]).inc()
        _gateway_logger.log(
            logging.INFO,
            "",
            extra={
                "request": {
                    "event": "gateway_rejection",
                    "method": request.method,
                    "path": request.url.path,
                    "status": 429,
                    "latency_ms": 0,
                    "user": user["name"],
                    "request_id": request_id,
                    "ip": (request.client and request.client.host) or "unknown",
                    "error": "rate_limit_exceeded",
                }
            },
        )
        return JSONResponse(
            status_code=429,
            content=_rejection_body(request, 429, "Rate limit exceeded", {"detail": "Rate limit exceeded"}),
            headers={"X-Request-ID": request_id},
        )

    if not await acquire_concurrent_slot(user):
        concurrent_limit_rejections.labels(user["name"]).inc()
        real_metrics.add_user_429(user["name"])
        total_requests.labels(request.method, request.url.path, "429", user["name"]).inc()
        _gateway_logger.log(
            logging.INFO,
            "",
            extra={
                "request": {
                    "event": "gateway_rejection",
                    "method": request.method,
                    "path": request.url.path,
                    "status": 429,
                    "latency_ms": 0,
                    "user": user["name"],
                    "request_id": request_id,
                    "ip": (request.client and request.client.host) or "unknown",
                    "error": "concurrent_limit_exceeded",
                }
            },
        )
        return JSONResponse(
            status_code=429,
            content=_rejection_body(
                request, 429, "Too many concurrent requests", {"detail": "Too many concurrent requests"}
            ),
            headers={"X-Request-ID": request_id},
        )

    from .db import get_user_total_today

    quota = user.get("daily_quota")
    if quota is not None and quota > 0:
        today_count = await get_user_total_today(user["id"])
        if today_count >= quota:
            real_metrics.add_user_429(user["name"])
            total_requests.labels(request.method, request.url.path, "429", user["name"]).inc()
            release_concurrent_slot(user)
            _gateway_logger.log(
                logging.INFO,
                "",
                extra={
                    "request": {
                        "event": "gateway_rejection",
                        "method": request.method,
                        "path": request.url.path,
                        "status": 429,
                        "latency_ms": 0,
                        "user": user["name"],
                        "request_id": request_id,
                        "ip": (request.client and request.client.host) or "unknown",
                        "error": f"daily_quota_exceeded({today_count}/{quota})",
                    }
                },
            )
            asyncio.create_task(
                webhook_notify.notify(
                    "quota_exceeded",
                    {"user_id": user["id"], "user_name": user["name"], "quota": quota, "used": today_count},
                )
            )
            return JSONResponse(
                status_code=429,
                content=_rejection_body(request, 429, "Daily quota exceeded", {"detail": "Daily quota exceeded"}),
                headers={"X-Request-ID": request_id},
            )
        elif today_count >= int(quota * 0.8):
            asyncio.create_task(
                webhook_notify.notify(
                    "quota_warning",
                    {"user_id": user["id"], "user_name": user["name"], "quota": quota, "used": today_count},
                )
            )

    start_time = time.monotonic()
    body = await request.body()
    endpoint, target_model_id = _determine_target_endpoint(body)

    if not endpoint or not target_model_id:
        release_concurrent_slot(user)
        total_requests.labels(request.method, request.url.path, "503", user["name"]).inc()
        elapsed = time.monotonic() - start_time
        _gateway_logger.log(
            logging.INFO,
            "",
            extra={
                "request": {
                    "event": "gateway_rejection",
                    "method": request.method,
                    "path": request.url.path,
                    "status": 503,
                    "latency_ms": round(elapsed * 1000, 1),
                    "user": user["name"],
                    "request_id": request_id,
                    "ip": (request.client and request.client.host) or "unknown",
                    "error": "no_active_model",
                }
            },
        )
        return JSONResponse(
            status_code=503,
            content=_rejection_body(
                request,
                503,
                "No model is currently active or ready",
                {
                    "error": {
                        "message": "No model is currently active or ready",
                        "type": "model_unavailable",
                        "code": "model_unavailable",
                    }
                },
            ),
            headers={"X-Request-ID": request_id},
        )

    model_access = await get_user_model_access(user["id"])
    if model_access and target_model_id not in {m["model_id"] for m in model_access}:
        release_concurrent_slot(user)
        total_requests.labels(request.method, request.url.path, "403", user["name"]).inc()
        _gateway_logger.log(
            logging.INFO,
            "",
            extra={
                "request": {
                    "event": "gateway_rejection",
                    "method": request.method,
                    "path": request.url.path,
                    "status": 403,
                    "latency_ms": 0,
                    "user": user["name"],
                    "request_id": request_id,
                    "ip": (request.client and request.client.host) or "unknown",
                    "error": "access_denied_model",
                    "model": target_model_id,
                }
            },
        )
        return JSONResponse(
            status_code=403,
            content={"error": {"message": "Access denied to model", "type": "access_denied", "code": "access_denied"}},
            headers={"X-Request-ID": request_id},
        )

    hdrs = dict(request.headers)
    for h in ["host", "connection", "keep-alive", "transfer-encoding", "upgrade"]:
        hdrs.pop(h, None)
    hdrs["X-Request-ID"] = request_id
    hdrs["X-Forwarded-For"] = request.headers.get("X-Forwarded-For", "")
    hdrs["X-Real-IP"] = request.headers.get("X-Real-IP", (request.client and request.client.host) or "")

    if str(request.query_params):
        target = endpoint + request.url.path + "?" + str(request.query_params)
    else:
        target = endpoint + request.url.path

    upstream_headers = {"X-Request-ID": request_id}
    upstream_content_type = [""]

    async def stream_generator():
        nonlocal start_time
        full_body = bytearray()
        try:
            async with httpx_pool.stream(request.method, target, headers=hdrs, content=body) as upstream:
                upstream_status_code[0] = upstream.status_code
                ct = upstream.headers.get("content-type", "")
                upstream_content_type[0] = ct
                for k, v in upstream.headers.items():
                    lk = k.lower()
                    if lk not in ("transfer-encoding", "content-encoding", "content-length"):
                        upstream_headers[k] = v
                async for chunk in upstream.aiter_bytes(chunk_size=8192):
                    full_body.extend(chunk)
                    yield chunk
                elapsed = time.monotonic() - start_time
                real_metrics.add_user_latency(user["name"], elapsed)
                request_latency.labels(
                    request.method, request.url.path, str(upstream_status_code[0]), user["name"]
                ).observe(elapsed)
                upstream_status.labels(str(upstream_status_code[0]), user["name"]).inc()
                total_requests.labels(
                    request.method, request.url.path, str(upstream_status_code[0]), user["name"]
                ).inc()
                if upstream_status_code[0] == 200:
                    from .db import upsert_usage

                    prompt_tok = 0
                    completion_tok = 0
                    if "text/event-stream" in upstream_content_type[0]:
                        usage_data = extract_usage_from_sse(bytes(full_body))
                    else:
                        usage_data = extract_usage_from_body(bytes(full_body))
                    prompt_tok = usage_data["prompt_tokens"]
                    completion_tok = usage_data["completion_tokens"]
                    await upsert_usage(user["id"], user.get("request_cost", 0.001), prompt_tok, completion_tok)
                asyncio.create_task(
                    audit_log.log_request(
                        user["id"],
                        request_id,
                        request.method,
                        request.url.path,
                        upstream_status_code[0],
                        elapsed * 1000,
                        None,
                    )
                )
        except httpx.ConnectError as e:
            elapsed = time.monotonic() - start_time
            dns_failure = _is_dns_failure(e)
            if dns_failure:
                # Container is absent from the docker network. Drop it from the
                # ready set so subsequent requests get a fast 503 with a proper
                # "no active model" response instead of the same DNS traceback.
                mark_not_ready(target_model_id)
                status = 502
                error_kind = "container_missing"
                message = "Model container is not registered; still starting or misconfigured."
            else:
                status = 503
                error_kind = "upstream_unreachable"
                message = "SGFleet model is not ready, please try again"
            if request.url.path == "/v1/messages":
                body_msg = json.dumps(_anthropic_error_body(status, message)).encode()
            elif dns_failure:
                body_msg = b'{"detail":"Model container is not registered; still starting or misconfigured."}'
            else:
                body_msg = b'{"detail":"SGFleet model is not ready, please try again"}'
            asyncio.create_task(
                audit_log.log_request(
                    user["id"],
                    request_id,
                    request.method,
                    request.url.path,
                    status,
                    elapsed * 1000,
                    f"{error_kind}: {target} ({e})",
                )
            )
            _gateway_logger.error(
                "%s: %s (%s)",
                error_kind,
                target,
                e,
                extra={
                    "request": {
                        "event": "upstream_failure",
                        "method": request.method,
                        "path": request.url.path,
                        "status": status,
                        "latency_ms": round(elapsed * 1000, 1),
                        "user": user["name"],
                        "request_id": request_id,
                        "ip": (request.client and request.client.host) or "unknown",
                        "error": f"{error_kind}: {e}",
                        "model": target_model_id,
                    }
                },
            )
            upstream_status_code[0] = status
            yield body_msg
        except Exception as e:
            elapsed = time.monotonic() - start_time
            asyncio.create_task(
                audit_log.log_request(
                    user["id"], request_id, request.method, request.url.path, 500, elapsed * 1000, str(e)
                )
            )
            _gateway_logger.log(
                logging.INFO,
                "",
                extra={
                    "request": {
                        "event": "upstream_failure",
                        "method": request.method,
                        "path": request.url.path,
                        "status": 500,
                        "latency_ms": round(elapsed, 1),
                        "user": user["name"],
                        "request_id": request_id,
                        "ip": (request.client and request.client.host) or "unknown",
                        "error": str(e),
                    }
                },
            )
            raise
        finally:
            release_concurrent_slot(user)

    upstream_status_code = [200]
    resp = StreamingResponse(
        stream_generator(),
        status_code=200,
        headers=upstream_headers,
    )

    return resp


async def passthrough_proxy(request: Request):
    from .db import is_setup_complete

    if not await is_setup_complete():
        return Response(
            content='{"detail":"System setup not complete"}',
            status_code=503,
            media_type="application/json",
        )

    endpoint = get_cached_active_endpoint()
    target = endpoint + request.url.path if endpoint else "http://localhost" + request.url.path
    if str(request.query_params):
        target += "?" + str(request.query_params)
    upstream = await httpx_passthrough.request(
        request.method,
        target,
        headers=dict(request.headers),
        content=await request.body(),
    )
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=dict(upstream.headers),
    )


def create_gateway_router() -> APIRouter:
    router = APIRouter()

    @router.api_route(
        "/v1/{path:path}",
        methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
    )
    async def gateway_route(path: str, request: Request):
        if request.method == "OPTIONS":
            return await handle_options()
        return await proxy_request(request)

    return router


def create_passthrough_router() -> APIRouter:
    router = APIRouter()

    @router.api_route(
        "/health{path:path}",
        methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"],
    )
    async def health_passthrough(path: str, request: Request):
        return await passthrough_proxy(request)

    @router.api_route(
        "/metrics",
        methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"],
    )
    async def metrics_passthrough(request: Request):
        return await passthrough_proxy(request)

    @router.api_route(
        "/docs{path:path}",
        methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"],
    )
    async def docs_passthrough(path: str, request: Request):
        return await passthrough_proxy(request)

    @router.api_route(
        "/openai_api_schema.json",
        methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"],
    )
    async def schema_passthrough(request: Request):
        return await passthrough_proxy(request)

    return router

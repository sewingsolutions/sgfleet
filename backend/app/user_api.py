import json
from collections import defaultdict
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Request

from . import metrics as real_metrics
from .admin_api import build_opencode_config
from .auth import _COOKIE_NAME, _USER_COOKIE_NAME
from .config_templates import (
    build_claude_code_config,
    build_cline_config,
    build_continue_config,
    build_cursor_checklist,
    build_interpreter_config,
)
from .db import (
    count_user_requests,
    get_active_models,
    get_user_default_model,
    get_user_model_access,
    get_user_requests,
    get_user_summary,
    get_user_usage,
    is_setup_complete,
    load_admin_api_key,
)

router = APIRouter(prefix="/api")


def _parse_time_range(range_str: str):
    now = datetime.now(UTC)
    if range_str == "today":
        return now - timedelta(days=1)
    elif range_str == "7d":
        return now - timedelta(days=7)
    elif range_str == "30d":
        return now - timedelta(days=30)
    return now - timedelta(days=1)


def _generate_hourly_labels(since: datetime):
    now = datetime.now(UTC)
    labels = []
    current = since.replace(minute=0, second=0, microsecond=0)
    while current <= now:
        labels.append(current.strftime("%Y-%m-%d %H:00"))
        current += timedelta(hours=1)
    return labels


@router.get("/session")
async def get_session(request: Request):
    if not await is_setup_complete():
        return {"error": "setup_required"}

    import jwt

    admin_cookie = request.cookies.get(_COOKIE_NAME)
    if admin_cookie:
        try:
            admin_key = await load_admin_api_key()
            jwt.decode(admin_cookie, admin_key, algorithms=["HS256"])
            from .db import get_admin_name

            name = await get_admin_name()
            return {"role": "admin", "name": name}
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            pass

    user_cookie = request.cookies.get(_USER_COOKIE_NAME)
    if user_cookie:
        try:
            decoded = jwt.decode(user_cookie, options={"verify_signature": False})
            user_id = decoded.get("user_id")
            if user_id:
                from .db import get_user_by_id

                user = await get_user_by_id(user_id)
                if user and user.get("is_active") and user.get("api_key"):
                    try:
                        jwt.decode(user_cookie, user["api_key"], algorithms=["HS256"])
                        return {"role": "user", "name": user["name"], "user_id": user["id"]}
                    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
                        pass
        except (jwt.InvalidTokenError, KeyError):
            pass

    return {"error": "unauthorized"}


@router.get("/user/me")
async def get_user_me(request: Request):
    from .auth import require_user

    await require_user(request)
    user = request.state.user
    return {
        "id": user["id"],
        "name": user["name"],
        "rate_limit": user["rate_limit"],
        "max_concurrent": user["max_concurrent"],
        "daily_quota": user["daily_quota"],
        "request_cost": user["request_cost"],
        "created_at": user["created_at"],
        "email": user.get("email"),
        "notes": user.get("notes"),
    }  # api_key and api_key_hash intentionally excluded


@router.get("/user/models")
async def get_user_models(request: Request):
    from .auth import require_user

    await require_user(request)
    user = request.state.user
    models = await get_user_model_access(user["id"])
    result = []
    for m in models:
        from .model_registry import is_ready

        result.append(
            {
                "model_id": m["model_id"],
                "name": m["name"],
                "active": m["active"],
                "ready": is_ready(m["model_id"]),
                "model_alias": m.get("model_alias", "sgfleet-api-model"),
            }
        )
    return {"models": result}


@router.get("/user/stats")
async def get_user_stats(request: Request, range: str = "today"):
    from .auth import require_user

    await require_user(request)
    user = request.state.user

    since = _parse_time_range(range)
    hourly_labels = _generate_hourly_labels(since)
    usage_rows = await get_user_usage(user["id"], since.strftime("%Y-%m-%d %H:%M:%S"))

    usage_by_hour = defaultdict(
        lambda: {"requests": 0, "cost": 0.0, "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    )
    for row in usage_rows:
        hour = row["hour"]
        usage_by_hour[hour]["requests"] = row["request_count"]
        usage_by_hour[hour]["cost"] = row["total_cost"]
        usage_by_hour[hour]["prompt_tokens"] = row.get("prompt_tokens", 0)
        usage_by_hour[hour]["completion_tokens"] = row.get("completion_tokens", 0)
        usage_by_hour[hour]["total_tokens"] = row.get("total_tokens", 0)

    requests_data = [usage_by_hour[label]["requests"] for label in hourly_labels]
    prompt_tokens = [usage_by_hour[label]["prompt_tokens"] for label in hourly_labels]
    completion_tokens = [usage_by_hour[label]["completion_tokens"] for label in hourly_labels]
    total_tokens = [usage_by_hour[label]["total_tokens"] for label in hourly_labels]

    display_labels = []
    for label in hourly_labels:
        dt = datetime.strptime(label, "%Y-%m-%d %H:00")
        if range == "30d":
            display_labels.append(f"{dt.strftime('%b %d')}")
        elif range == "7d":
            display_labels.append(f"{dt.strftime('%a')}\n{dt.strftime('%H:%M')}")
        else:
            display_labels.append(dt.strftime("%H:%M"))

    since_time = since.timestamp()
    latency_by_hour = real_metrics.get_user_latency_percentiles_per_hour(user["name"], since_time)
    c429_by_hour = real_metrics.get_user_429_per_hour(user["name"], since_time)

    latency_p50 = []
    latency_p95 = []
    count_429 = []
    for label in hourly_labels:
        if label in latency_by_hour:
            latency_p50.append(latency_by_hour[label][0])
            latency_p95.append(latency_by_hour[label][1])
        else:
            latency_p50.append(0)
            latency_p95.append(0)
        count_429.append(c429_by_hour.get(label, 0))

    from .db import get_user_total_today

    today_count = await get_user_total_today(user["id"])

    return {
        "labels": display_labels,
        "requests": requests_data,
        "latency_p50": latency_p50,
        "latency_p95": latency_p95,
        "count_429": count_429,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
        "today_requests": today_count,
        "in_memory_note": range != "30d",
    }


@router.get("/user/requests")
async def get_user_requests_endpoint(request: Request, limit: int = 50, offset: int = 0):
    from .auth import require_user

    await require_user(request)
    user = request.state.user
    entries = await get_user_requests(user["id"], limit=limit, offset=offset)
    total = await count_user_requests(user["id"])
    return {"requests": entries, "total": total, "limit": limit, "offset": offset}


@router.get("/user/quota")
async def get_user_quota(request: Request):
    from .auth import require_user

    await require_user(request)
    user = request.state.user

    from .db import get_user_total_today

    today_count = await get_user_total_today(user["id"])
    quota = user.get("daily_quota")

    summary = await get_user_summary(user["id"])

    return {
        "daily_quota": quota,
        "today_requests": today_count,
        "remaining": (quota - today_count) if quota else None,
        "usage_percent": round(today_count / quota * 100, 1) if quota and quota > 0 else None,
        "total_requests": summary["total_requests"],
        "total_tokens": summary["total_tokens"],
        "total_prompt_tokens": summary["prompt_tokens"],
        "total_completion_tokens": summary["completion_tokens"],
    }


@router.post("/user/config")
async def generate_user_config(request: Request):
    from .auth import require_user

    await require_user(request)
    user = request.state.user

    body = await request.json()
    client_type = body.get("client", "opencode")

    raw_key = user.get("api_key")
    if not raw_key:
        return {"error": "No stored API key — ask admin to rotate your key"}

    default_model = await get_user_default_model(user["id"])
    if not default_model:
        active_models = await get_active_models()
        if active_models:
            default_model = active_models[0]
    if not default_model:
        return {"error": "No active model available"}

    model_alias = default_model.get("model_alias", "sgfleet-api-model")
    model_name = default_model.get("name", default_model["model_id"])
    context_length = default_model.get("context_length", 32768)
    max_output_length = default_model.get("max_output_length", 4096)

    from .db import get_db

    async with get_db() as db, db.execute("SELECT value FROM config WHERE key = ?", ("sgfleet_base_url",)) as cursor:
        row = await cursor.fetchone()
        base = row["value"] if row else "http://localhost"

    if client_type == "opencode":
        config_obj = build_opencode_config(raw_key, model_alias, model_name, context_length, max_output_length, base)
        config_json = json.dumps(config_obj, indent=2)
        return {"api_key": raw_key, "config": config_obj, "config_json": config_json}

    if client_type == "continue":
        config_json = build_continue_config(raw_key, model_alias, model_name, base, context_length, max_output_length)
        return {"api_key": raw_key, "config": {}, "config_json": config_json}

    if client_type == "cline":
        config_json = build_cline_config(raw_key, model_alias, model_name, base, context_length, max_output_length)
        return {"api_key": raw_key, "config": {}, "config_json": config_json}

    if client_type == "interpreter":
        config_json = build_interpreter_config(
            raw_key, model_alias, model_name, base, context_length, max_output_length
        )
        return {"api_key": raw_key, "config": {}, "config_json": config_json}

    if client_type == "cursor":
        checklist = build_cursor_checklist(raw_key, model_alias, model_name, base, context_length, max_output_length)
        return {"api_key": raw_key, "config": {}, "checklist": checklist}

    if client_type == "claude_code":
        config_json = build_claude_code_config(
            raw_key, model_alias, model_name, base, context_length, max_output_length
        )
        return {"api_key": raw_key, "config": {}, "config_json": config_json}

    config = {"base_url": base, "api_key": raw_key, "model": model_alias, "client": client_type}
    return {"api_key": raw_key, "config": config, "config_json": json.dumps(config, indent=2)}

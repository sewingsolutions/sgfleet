import asyncio
import contextlib
import json
import os
import secrets
import tempfile
import time

import httpx
import psutil
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from . import audit as audit_log
from . import metrics as real_metrics
from . import webhooks as webhook_notify
from .auth import require_admin
from .config import settings
from .db import (
    bootstrap_models_from_json,
    create_user,
    export_models_to_dict,
    get_active_models,
    get_all_models,
    get_all_users,
    get_db,
    get_model_by_id,
    get_user_by_id,
    get_user_by_name,
    get_user_default_model,
    get_user_model_access,
    get_user_summary,
    rotate_key,
    set_user_default_model,
    soft_delete,
    update_user,
)
from .db import (
    create_model as db_create_model,
)
from .db import (
    delete_model as db_delete_model,
)
from .db import (
    update_model as db_update_model,
)
from .docker_manager import (
    ensure_models_sync,
    get_container_status,
)
from .docker_manager import (
    start_model as docker_start_model,
)
from .docker_manager import (
    stop_model as docker_stop_model,
)
from .model_registry import (
    mark_not_ready,
    mark_ready,
    reload_cache,
    set_ready_ids,
)

_startup_time = time.time()

router = APIRouter(prefix="/admin/api")


@router.get("/dashboard")
async def get_dashboard_stats(request: Request):
    await require_admin(request)
    async with get_db() as db:
        async with db.execute("SELECT COUNT(*) FROM models") as cursor:
            row = await cursor.fetchone()
            total_models = row[0] if row else 0
        async with db.execute("SELECT COUNT(*) FROM models WHERE active = 1") as cursor:
            row = await cursor.fetchone()
            active_models = row[0] if row else 0
        async with db.execute("SELECT COUNT(*) FROM users WHERE is_active = 1") as cursor:
            row = await cursor.fetchone()
            active_users = row[0] if row else 0
        async with db.execute("SELECT COUNT(*) FROM users") as cursor:
            row = await cursor.fetchone()
            total_users = row[0] if row else 0
        async with db.execute(
            'SELECT COALESCE(SUM(request_count), 0) FROM user_usage WHERE hour >= datetime(?, "-24 hours")',
            (time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime()),),
        ) as cursor:
            row = await cursor.fetchone()
            requests_24h = row[0] if row else 0
        async with db.execute(
            'SELECT COUNT(*) FROM admin_log WHERE timestamp >= ? AND (level = "ERROR" OR status >= 500)',
            (time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - 86400)),),
        ) as cursor:
            row = await cursor.fetchone()
            errors_24h = row[0] if row else 0
    since = time.time() - 86400
    avg_latency_ms = round(real_metrics.get_fleet_latency_percentiles(since, 50) * 1000, 1)
    rate_limited = real_metrics.get_fleet_429_count(since)
    uptime_seconds = round(time.time() - _startup_time)
    return {
        "total_models": total_models,
        "active_models": active_models,
        "total_users": total_users,
        "active_users": active_users,
        "requests_24h": requests_24h,
        "errors_24h": errors_24h,
        "median_latency_ms": avg_latency_ms,
        "rate_limited_24h": rate_limited,
        "uptime_seconds": uptime_seconds,
    }


def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    client = request.client
    if not client:
        return "unknown"
    return client.host or "unknown"


class CreateUser(BaseModel):
    name: str
    rate_limit: float = 2
    max_concurrent: int = 2
    request_cost: float = 0.001
    daily_quota: int | None = None


class UpdateUser(BaseModel):
    is_active: bool | None = None
    rate_limit: float | None = None
    max_concurrent: int | None = None
    request_cost: float | None = None
    daily_quota: int | None = None
    email: str | None = None
    notes: str | None = None


class BulkUserUpdate(BaseModel):
    """Bulk enable/disable multiple users at once."""

    is_active: bool
    user_ids: list[int]


def mask_key(key_hash: str) -> str:
    """Return masked version of any key hash string."""
    return "sk-***"


# --- User Endpoints ---


@router.get("/users")
async def list_users(request: Request):
    await require_admin(request)
    users = await get_all_users()
    return [
        {
            "id": u["id"],
            "name": u["name"],
            "is_active": bool(u["is_active"]),
            "rate_limit": u["rate_limit"],
            "max_concurrent": u["max_concurrent"],
            "request_cost": u["request_cost"],
            "daily_quota": u["daily_quota"],
            "created_at": u["created_at"],
            "today_requests": u["today_requests"],
            "total_requests": u["total_requests"],
            "api_key": mask_key(u["api_key_hash"]),
            "email": u.get("email"),
            "notes": u.get("notes"),
        }
        for u in users
    ]


@router.post("/users")
async def create_new_user(request: Request, body: CreateUser):
    """Create a new user. Request body should have {name, rate_limit, max_concurrent}."""
    await require_admin(request)
    if not body.name or len(body.name) < 2:
        raise HTTPException(status_code=400, detail="Invalid name")

    raw_key = settings.generate_key()
    user = await create_user(
        body.name, raw_key, body.rate_limit, body.max_concurrent, body.request_cost, body.daily_quota
    )
    asyncio.create_task(audit_log.log_admin_action("create_user", user["id"], body.name, _client_ip(request)))
    return {
        "id": user["id"],
        "name": user["name"],
        "is_active": True,
        "rate_limit": user["rate_limit"],
        "max_concurrent": user["max_concurrent"],
        "request_cost": user["request_cost"],
        "daily_quota": user["daily_quota"],
        "created_at": user["created_at"],
        "api_key": raw_key,
    }


@router.get("/users/{user_id}")
async def get_user_detail(request: Request, user_id: int, show_key: bool = False):
    await require_admin(request)
    user = await get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    response = {
        "id": user["id"],
        "name": user["name"],
        "is_active": bool(user["is_active"]),
        "rate_limit": user["rate_limit"],
        "max_concurrent": user["max_concurrent"],
        "request_cost": user["request_cost"],
        "daily_quota": user["daily_quota"],
        "created_at": user["created_at"],
        "api_key": mask_key(user["api_key_hash"]),
    }
    if show_key:
        response["api_key_hint"] = "Key was hashed - use rotate to generate a new one"
    return response


@router.patch("/users/{user_id}")
async def update_existing_user(request: Request, user_id: int):
    await require_admin(request)
    user = await get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Accept both JSON body and form-encoded (HTMX hx-include sends form)
    ct = request.headers.get("content-type", "")
    if "json" in ct:
        data: dict[str, str] = {k: str(v) for k, v in (await request.json()).items()}
    else:
        form = await request.form()
        data = {k: v for k, v in dict(form).items() if isinstance(v, str)}
    name = data.get("name") if "name" in data else None
    if name is not None:
        name = name.strip() or None
    is_active = data.get("is_active")
    if is_active is not None:
        is_active = is_active.lower() == "true"
    rate_limit = float(data["rate_limit"]) if "rate_limit" in data else None
    max_concurrent = int(data["max_concurrent"]) if "max_concurrent" in data else None
    request_cost = float(data["request_cost"]) if "request_cost" in data else None
    daily_quota = None
    if "daily_quota" in data:
        raw = data["daily_quota"]
        daily_quota = None if not raw or raw == "null" else int(raw)
    email = data.get("email") or None
    notes = data.get("notes") or None
    await update_user(
        user_id,
        name=name,
        is_active=is_active,
        rate_limit=rate_limit,
        max_concurrent=max_concurrent,
        request_cost=request_cost,
        daily_quota=daily_quota,
        email=email,
        notes=notes,
    )
    updated = await get_user_by_id(user_id)
    if not updated:
        raise HTTPException(status_code=404, detail="User not found after update")
    asyncio.create_task(
        audit_log.log_admin_action(
            "update_user",
            user_id,
            json.dumps(
                {
                    k: v
                    for k, v in {
                        "name": name,
                        "is_active": is_active,
                        "rate_limit": rate_limit,
                        "max_concurrent": max_concurrent,
                        "request_cost": request_cost,
                        "daily_quota": daily_quota,
                        "email": email,
                        "notes": notes,
                    }.items()
                    if v is not None
                }
            ),
            _client_ip(request),
        )
    )
    if is_active is False:
        asyncio.create_task(webhook_notify.notify("user_disabled", {"user_id": user_id, "user_name": updated["name"]}))
    return {
        "id": updated["id"],
        "name": updated["name"],
        "is_active": bool(updated["is_active"]),
        "rate_limit": updated["rate_limit"],
        "max_concurrent": updated["max_concurrent"],
        "request_cost": updated["request_cost"],
        "daily_quota": updated["daily_quota"],
        "email": updated.get("email"),
        "notes": updated.get("notes"),
    }


@router.post("/users/{user_id}/rotate")
async def rotate_user_key(request: Request, user_id: int):
    await require_admin(request)
    user = await get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    raw_key = settings.generate_key()
    await rotate_key(user_id, raw_key)
    asyncio.create_task(audit_log.log_admin_action("rotate_key", user_id, user["name"], _client_ip(request)))
    asyncio.create_task(webhook_notify.notify("key_rotated", {"user_id": user_id, "user_name": user["name"]}))
    return {"id": user["id"], "name": user["name"], "api_key": raw_key}


@router.delete("/users/{user_id}")
async def delete_user(request: Request, user_id: int):
    await require_admin(request)
    user = await get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await soft_delete(user_id)
    asyncio.create_task(audit_log.log_admin_action("delete_user", user_id, user["name"], _client_ip(request)))
    return {"id": user_id, "name": user["name"], "deleted": True}


@router.patch("/users/bulk")
async def bulk_update_users(request: Request, body: BulkUserUpdate):
    """Bulk enable/disable multiple users at once."""
    await require_admin(request)
    results = []
    for uid in body.user_ids:
        existing = await get_user_by_id(uid)
        if existing:
            await update_user(uid, is_active=body.is_active)
            results.append({"id": uid, "name": existing["name"], "is_active": body.is_active})
    asyncio.create_task(
        audit_log.log_admin_action(
            "bulk_update",
            None,
            json.dumps({"is_active": body.is_active, "count": len(results), "user_ids": body.user_ids}),
            _client_ip(request),
        )
    )
    return results


@router.get("/audit_log")
async def get_audit_log_route(request: Request, limit: int = 200):
    await require_admin(request)
    return await audit_log.get_audit_log(limit)


@router.get("/users/{user_id}/requests")
async def get_user_requests_route(request: Request, user_id: int, limit: int = 100):
    await require_admin(request)
    return await audit_log.get_user_requests(user_id, limit)


@router.get("/users/{user_id}/summary")
async def get_user_summary_route(request: Request, user_id: int):
    await require_admin(request)
    summary = await get_user_summary(user_id)
    if summary is None:
        raise HTTPException(status_code=404, detail="User not found")
    return summary


@router.get("/users/{user_id}/model-access")
async def get_user_model_access_endpoint(request: Request, user_id: int):
    await require_admin(request)
    models = await get_user_model_access(user_id)
    return models


@router.get("/users/{user_id}/default-model")
async def get_user_default_model_endpoint(request: Request, user_id: int):
    await require_admin(request)
    model = await get_user_default_model(user_id)
    return model


@router.put("/users/{user_id}/default-model")
async def set_user_default_model_endpoint(request: Request, user_id: int):
    await require_admin(request)
    user = await get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    data = await request.json()
    model_id = data.get("model_id")
    if model_id:
        await set_user_default_model(user_id, model_id)
    else:
        await set_user_default_model(user_id, None)
    asyncio.create_task(
        audit_log.log_admin_action(
            "set_user_default_model", user_id, json.dumps({"model_id": model_id}), _client_ip(request)
        )
    )
    return {"updated": True}


# --- Settings Endpoints ---


@router.get("/settings/defaults")
async def get_settings_defaults(request: Request):
    await require_admin(request)
    return {
        "default_rate_limit": settings.default_rate_limit,
        "default_max_concurrent": settings.default_max_concurrent,
        "default_request_cost": settings.default_request_cost,
    }


@router.patch("/settings/defaults")
async def update_settings_defaults(request: Request):
    await require_admin(request)
    data = await request.json()
    async with get_db() as db:
        for key in ("default_rate_limit", "default_max_concurrent", "default_request_cost"):
            if key in data:
                await db.execute("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", (key, str(data[key])))
        await db.commit()
    asyncio.create_task(
        audit_log.log_admin_action(
            "update_settings",
            None,
            json.dumps(
                {
                    k: data[k]
                    for k in ("default_rate_limit", "default_max_concurrent", "default_request_cost")
                    if k in data
                }
            ),
            _client_ip(request),
        )
    )
    async with get_db() as db, db.execute("SELECT * FROM config") as cursor:
        for row in await cursor.fetchall():
            key = row[0]
            if hasattr(settings, key):
                val = row[1]
                if isinstance(getattr(settings.__class__, key, None), property) or key.startswith("default_"):
                    field_type = type(getattr(settings, key))
                    with contextlib.suppress(ValueError, TypeError):
                        object.__setattr__(settings, key, field_type(val))
    return await get_settings_defaults(request)


# --- Model Endpoints ---


@router.get("/model/config")
async def get_model_config(request: Request, model_id: str | None = None):
    await require_admin(request)
    if model_id:
        m = await get_model_by_id(model_id)
        if not m:
            raise HTTPException(status_code=404, detail="Model not found")
        endpoint = f"http://{m['container_alias']}:{m['port']}"
        if endpoint:
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    resp = await client.get(f"{endpoint}/v1/models")
                    if resp.status_code == 200:
                        data = resp.json()
                        models = data.get("data", [])
                        if models:
                            return {
                                "model_path": models[0]["id"],
                                "model_name": models[0].get("name", models[0]["id"]),
                                "context_length": m.get("context_length", 32768),
                                "max_output_length": m.get("max_output_length", 4096),
                            }
            except Exception:
                pass
        return {
            "model_path": m["model_path"],
            "model_name": m["name"],
            "context_length": m.get("context_length", 32768),
            "max_output_length": m.get("max_output_length", 4096),
        }
    active_models = await get_active_models()
    if not active_models:
        raise HTTPException(status_code=503, detail="No active models")
    cfg = active_models[0]
    endpoint = f"http://{cfg['container_alias']}:{cfg['port']}"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{endpoint}/v1/models")
            if resp.status_code == 200:
                data = resp.json()
                models = data.get("data", [])
                if models:
                    return {
                        "model_path": models[0]["id"],
                        "model_name": models[0].get("name", models[0]["id"]),
                        "context_length": cfg.get("context_length", 32768),
                        "max_output_length": cfg.get("max_output_length", 4096),
                    }
    except Exception:
        pass
    return {
        "model_path": cfg["model_path"],
        "model_name": cfg["name"],
        "context_length": cfg.get("context_length", 32768),
        "max_output_length": cfg.get("max_output_length", 4096),
    }


@router.get("/models")
async def list_models_db(request: Request):
    await require_admin(request)
    models = await get_all_models()
    result = []
    for m in models:
        status = await get_container_status(m["container_name"])
        container_state = status["state"] if status else "stopped"
        result.append(
            {
                **m,
                "status": container_state,
            }
        )
    return result


@router.get("/models/{model_id}")
async def get_model_detail(request: Request, model_id: str):
    await require_admin(request)
    m = await get_model_by_id(model_id)
    if not m:
        raise HTTPException(status_code=404, detail="Model not found")
    status = await get_container_status(m["container_name"])
    container_state = status["state"] if status else "stopped"
    return {**m, "status": container_state}


@router.post("/models")
async def create_new_model(request: Request):
    await require_admin(request)
    data = await request.json()
    if not data.get("model_id") or not data.get("name") or not data.get("image") or not data.get("model_path"):
        raise HTTPException(status_code=400, detail="model_id, name, image, and model_path are required")
    existing = await get_model_by_id(data["model_id"])
    if existing:
        raise HTTPException(status_code=409, detail="Model ID already exists")
    await db_create_model(data)
    await reload_cache()
    asyncio.create_task(
        audit_log.log_admin_action(
            "create_model", None, json.dumps({"model_id": data["model_id"]}), _client_ip(request)
        )
    )
    return await get_model_by_id(data["model_id"])


@router.put("/models/{model_id}")
async def update_existing_model(request: Request, model_id: str):
    await require_admin(request)
    existing = await get_model_by_id(model_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Model not found")
    data = await request.json()
    await db_update_model(model_id, data)
    await reload_cache()
    asyncio.create_task(
        audit_log.log_admin_action("update_model", None, json.dumps({"model_id": model_id}), _client_ip(request))
    )
    return await get_model_by_id(model_id)


@router.delete("/models/{model_id}")
async def delete_model_endpoint(request: Request, model_id: str):
    await require_admin(request)
    existing = await get_model_by_id(model_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Model not found")
    if existing["active"]:
        raise HTTPException(status_code=400, detail="Cannot delete an active model. Deactivate first.")
    await docker_stop_model(existing)
    mark_not_ready(model_id)
    await db_delete_model(model_id)
    await reload_cache()
    asyncio.create_task(
        audit_log.log_admin_action("delete_model", None, json.dumps({"model_id": model_id}), _client_ip(request))
    )
    return {"deleted": model_id}


@router.post("/models/{model_id}/start")
async def start_model_endpoint(request: Request, model_id: str):
    await require_admin(request)
    m = await get_model_by_id(model_id)
    if not m:
        raise HTTPException(status_code=404, detail="Model not found")
    try:
        await docker_start_model(m)
        mark_ready(model_id)
    except Exception:
        mark_not_ready(model_id)
        raise
    await reload_cache()
    return {"started": model_id}


@router.post("/models/{model_id}/stop")
async def stop_model_endpoint(request: Request, model_id: str):
    await require_admin(request)
    m = await get_model_by_id(model_id)
    if not m:
        raise HTTPException(status_code=404, detail="Model not found")
    await docker_stop_model(m)
    mark_not_ready(model_id)
    return {"stopped": model_id}


@router.post("/models/{model_id}/toggle")
async def toggle_model_endpoint(request: Request, model_id: str):
    await require_admin(request)
    m = await get_model_by_id(model_id)
    if not m:
        raise HTTPException(status_code=404, detail="Model not found")
    new_active = not m["active"]
    await db_update_model(model_id, {"active": new_active})
    await reload_cache()
    if new_active:
        ready = await ensure_models_sync(await get_all_models())
        set_ready_ids(ready)
    else:
        await docker_stop_model(m)
        mark_not_ready(model_id)
    asyncio.create_task(
        audit_log.log_admin_action(
            "toggle_model", None, json.dumps({"model_id": model_id, "active": new_active}), _client_ip(request)
        )
    )
    return {"model_id": model_id, "active": new_active}


@router.get("/models/{model_id}/users")
async def get_model_users(request: Request, model_id: str):
    await require_admin(request)
    m = await get_model_by_id(model_id)
    if not m:
        raise HTTPException(status_code=404, detail="Model not found")
    async with (
        get_db() as db,
        db.execute(
            """SELECT u.* FROM users u
           JOIN user_model_access uma ON u.id = uma.user_id
           WHERE uma.model_id = ?""",
            (m["id"],),
        ) as cursor,
    ):
        rows = await cursor.fetchall()
    users = []
    for r in rows:
        d = dict(r)
        users.append(
            {
                "id": d["id"],
                "name": d["name"],
                "is_active": bool(d["is_active"]),
            }
        )
    return {"users": users}


@router.put("/models/{model_id}/users")
async def set_model_users(request: Request, model_id: str):
    await require_admin(request)
    m = await get_model_by_id(model_id)
    if not m:
        raise HTTPException(status_code=404, detail="Model not found")
    data = await request.json()
    user_ids = data.get("user_ids", [])
    async with get_db() as db:
        await db.execute("DELETE FROM user_model_access WHERE model_id = ?", (m["id"],))
        for uid in user_ids:
            await db.execute(
                "INSERT OR IGNORE INTO user_model_access (user_id, model_id) VALUES (?, ?)", (uid, m["id"])
            )
        await db.commit()
    return {"updated": True}


@router.post("/models/export")
async def export_models(request: Request):
    await require_admin(request)
    models = await export_models_to_dict()
    return {"json": json.dumps({"models": models}, indent=2)}


@router.post("/models/import")
async def import_models(request: Request):
    await require_admin(request)
    data = await request.json()
    raw = data.get("json", "")
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=True) as f:
        f.write(raw)
        f.flush()
        count = await bootstrap_models_from_json(f.name)
    await reload_cache()
    asyncio.create_task(
        audit_log.log_admin_action("import_models", None, json.dumps({"imported": count}), _client_ip(request))
    )
    return {"imported": count}


# --- User Config Generation ---


class GenerateConfigRequest(BaseModel):
    user_id: int
    rotate: bool = False


def build_opencode_config(api_key: str, model_id: str, model_name: str, context: int, output: int) -> dict:
    """Build an opencode.json config snippet for the given user and model."""
    return {
        "$schema": "https://opencode.ai/config.json",
        "provider": {
            "sewingsolutions": {
                "npm": "@ai-sdk/openai-compatible",
                "name": "SGFleet",
                "options": {
                    "baseURL": "https://your-gateway-domain.example.com/v1",
                    "apiKey": api_key,
                },
                "models": {
                    model_id: {
                        "name": model_name,
                        "limit": {
                            "context": context,
                            "output": output,
                        },
                    },
                },
            },
        },
        "model": f"sewingsolutions{model_id}",
        "lsp": True,
    }


@router.post("/users/{user_id}/config")
async def generate_user_config(request: Request, user_id: int, body: GenerateConfigRequest):
    await require_admin(request)
    user = await get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if body.rotate:
        raw_key = settings.generate_key()
        await rotate_key(user_id, raw_key)
    else:
        raw_key = user.get("api_key")
        if not raw_key:
            raise HTTPException(status_code=400, detail="No stored API key — rotate first, then try again")

    default_model = await get_user_default_model(user_id)
    if not default_model:
        active_models = await get_active_models()
        if active_models:
            default_model = active_models[0]
    if not default_model:
        raise HTTPException(status_code=503, detail="No active model available")

    model_alias = default_model.get("model_alias", "sgfleet-api-model")
    model_name = default_model.get("name", default_model["model_id"])
    context_length = default_model.get("context_length", 32768)
    max_output_length = default_model.get("max_output_length", 4096)
    config = build_opencode_config(raw_key, model_alias, model_name, context_length, max_output_length)
    return {
        "api_key": raw_key,
        "rotated": body.rotate,
        "config": config,
        "config_json": json.dumps(config, indent=2),
    }


# --- System Endpoints ---


@router.get("/git_log")
async def get_git_log(request: Request):
    """Return current build info and recent commit log.

    Build hash is read from VERSION.txt (generated at build time).
    Commit log file (GIT_LOG.txt) is generated alongside it and bundled
    into the container image.
    """
    await require_admin(request)
    app_dir = os.path.dirname(__file__)
    version_file = os.path.join(app_dir, "VERSION.txt")
    gitlog_file = os.path.join(app_dir, "GIT_LOG.txt")

    try:
        with open(version_file) as f:
            head = f.read().strip()
    except Exception:
        head = "unknown"

    commits = []
    try:
        with open(gitlog_file) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                parts = line.split(" ", 1)
                commits.append({"sha": parts[0], "msg": parts[1] if len(parts) > 1 else ""})
    except Exception:
        pass

    return {"head": head, "commits": commits}


@router.post("/settings/import_users")
async def import_users(request: Request):
    """Import users from JSON body. Accepts list of {name, [api_key], [rate_limit], [max_concurrent], ...}."""
    await require_admin(request)
    body = await request.json()
    if not isinstance(body, list):
        raise HTTPException(status_code=400, detail="Expected JSON array of user objects")
    created = []
    existing = []
    for item in body:
        if not isinstance(item, dict) or "name" not in item:
            continue
        name = item["name"]
        try:
            existing_user = await get_user_by_name(name)
            if existing_user:
                existing.append(name)
                continue
            raw_key = item.get("api_key") or settings.generate_key()
            await create_user(
                name,
                raw_key,
                item.get("rate_limit", settings.default_rate_limit),
                item.get("max_concurrent", settings.default_max_concurrent),
                item.get("request_cost", settings.default_request_cost),
                item.get("daily_quota"),
                item.get("email"),
                item.get("notes"),
            )
            created.append(name)
        except Exception:
            continue
    asyncio.create_task(
        audit_log.log_admin_action(
            "import_users", None, json.dumps({"created": created, "skipped": existing}), _client_ip(request)
        )
    )
    return {"created": created, "skipped": existing, "total_imported": len(created)}


@router.post("/settings/export_db")
async def export_db(request: Request):
    """Export full database as JSON (users + config)."""
    await require_admin(request)
    async with get_db() as db:
        async with db.execute("SELECT * FROM users") as cursor:
            users_rows = await cursor.fetchall()
        async with db.execute("SELECT * FROM config") as cursor:
            config_rows = await cursor.fetchall()
        async with db.execute("PRAGMA table_info(users)") as cursor:
            user_cols = [row[1] for row in await cursor.fetchall()]
    users = [dict(zip(user_cols, row, strict=True)) for row in users_rows]
    config = {row[0]: row[1] for row in config_rows}
    return {"json": json.dumps({"users": users, "config": config}, indent=2), "users_count": len(users)}


@router.post("/settings/rotate_admin_key")
async def rotate_admin_key(request: Request):
    """Rotate admin API key. Old key remains valid for 24h."""
    await require_admin(request)
    new_key = settings.generate_key()
    import bcrypt

    hashed = bcrypt.hashpw(new_key.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    from datetime import datetime

    async with get_db() as db:
        # Store old key with expiration
        old_expired = datetime.now().isoformat()
        async with db.execute("SELECT value FROM config WHERE key = ?", ("admin_api_key_hash",)) as cursor:
            current = await cursor.fetchone()
        if current:
            await db.execute(
                "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", ("admin_api_key_hash_old", current["value"])
            )
            await db.execute(
                "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", ("admin_api_key_old_expires", old_expired)
            )
        await db.execute("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", ("admin_api_key_hash", hashed))
        await db.commit()
    # Update in-memory settings so new sessions can be created
    object.__setattr__(settings, "admin_api_key", new_key)
    asyncio.create_task(audit_log.log_admin_action("rotate_admin_key", None, None, _client_ip(request)))
    return {"new_key": new_key}


@router.get("/settings/server_info")
async def get_server_info(request: Request):
    await require_admin(request)
    active_models = await get_active_models()
    models_info = []
    for m in active_models:
        endpoint = f"http://{m['container_alias']}:{m['port']}"
        info = {
            "model_id": m["model_id"],
            "name": m["name"],
            "model_path": m["model_path"],
            "context_length": m.get("context_length", 32768),
            "max_output_length": m.get("max_output_length", 4096),
            "endpoint": endpoint,
            "container_name": m["container_name"],
        }
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{endpoint}/v1/models")
                if resp.status_code == 200:
                    data = resp.json()
                    models = data.get("data", [])
                    if models:
                        info["live_model_id"] = models[0]["id"]
                        info["live_model_name"] = models[0].get("name", models[0]["id"])
        except Exception:
            pass
        models_info.append(info)
    return {
        "models": models_info,
        "primary_model": models_info[0] if models_info else None,
    }


# --- Webhook Endpoints ---
@router.get("/webhooks")
async def list_webhooks(request: Request):
    await require_admin(request)
    async with (
        get_db() as db,
        db.execute("SELECT id, name, url, events, is_active, secret, created_at FROM webhooks ORDER BY id") as cursor,
    ):
        rows = await cursor.fetchall()
    return [
        {
            "id": r[0],
            "name": r[1],
            "url": r[2],
            "events": json.loads(r[3]),
            "is_active": bool(r[4]),
            "secret": r[5],
            "created_at": r[6],
        }
        for r in rows
    ]


@router.post("/webhooks")
async def create_webhook(request: Request):
    await require_admin(request)
    data = await request.json()
    name = data.get("name", "")
    url = data.get("url", "")
    events = data.get("events", [])
    secret = data.get("secret") or secrets.token_hex(16)
    if not name or not url:
        raise HTTPException(status_code=400, detail="name and url required")
    async with get_db() as db:
        await db.execute(
            "INSERT INTO webhooks (name, url, events, is_active, secret) VALUES (?, ?, ?, 1, ?)",
            (name, url, json.dumps(events), secret),
        )
        await db.commit()
    asyncio.create_task(
        audit_log.log_admin_action("create_webhook", None, json.dumps({"name": name, "url": url}), _client_ip(request))
    )
    return {"created": {"name": name, "url": url, "events": events, "secret": secret}}


@router.delete("/webhooks/{webhook_id}")
async def delete_webhook(request: Request, webhook_id: int):
    await require_admin(request)
    async with get_db() as db:
        await db.execute("DELETE FROM webhooks WHERE id = ?", (webhook_id,))
        await db.commit()
    asyncio.create_task(audit_log.log_admin_action("delete_webhook", None, str(webhook_id), _client_ip(request)))
    return {"deleted": webhook_id}


@router.patch("/webhooks/{webhook_id}")
async def update_webhook(request: Request, webhook_id: int):
    await require_admin(request)
    data = await request.json()
    async with get_db() as db:
        for key in ("name", "url", "events", "is_active"):
            if key in data:
                val = json.dumps(data[key]) if key == "events" else data[key]
                await db.execute(f"UPDATE webhooks SET {key} = ? WHERE id = ?", (val, webhook_id))
        await db.commit()
    asyncio.create_task(audit_log.log_admin_action("update_webhook", None, json.dumps(data), _client_ip(request)))
    webhooks = await list_webhooks(request)
    return next((w for w in webhooks if w["id"] == webhook_id), None)


# --- Model Test & Health Endpoints ---


@router.post("/model/test")
async def test_model(request: Request, model_id: str | None = None):
    await require_admin(request)
    if model_id:
        m = await get_model_by_id(model_id)
        if not m:
            raise HTTPException(status_code=404, detail="Model not found")
        endpoint = f"http://{m['container_alias']}:{m['port']}"
    else:
        active_models = await get_active_models()
        if not active_models:
            raise HTTPException(status_code=503, detail="No active models")
        m = active_models[0]
        endpoint = f"http://{m['container_alias']}:{m['port']}"

    body = await request.json()
    payload = body.get(
        "body",
        {
            "model": m["model_alias"],
            "messages": [{"role": "user", "content": "Say hi in one short sentence."}],
            "max_tokens": 512,
        },
    )
    if "model" not in payload:
        payload["model"] = m["model_alias"]

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            start = time.monotonic()
            resp = await client.post(f"{endpoint}/v1/chat/completions", json=payload)
            latency_ms = round((time.monotonic() - start) * 1000)
            if resp.status_code != 200:
                return {
                    "success": False,
                    "error": resp.text[:500],
                    "status_code": resp.status_code,
                    "latency_ms": latency_ms,
                }
            data = resp.json()
            choices = data.get("choices", [])
            msg = choices[0].get("message", {}) if choices else {}
            content = msg.get("content") or ""
            reasoning = msg.get("reasoning_content") or ""
            # Fall back to reasoning trace if the model streamed everything there
            # (reasoning models like Qwen3 do this when max_tokens is small).
            display = content.strip() or (f"[reasoning] {reasoning.strip()}" if reasoning else "(empty response)")
            return {
                "success": True,
                "content": display,
                "raw_content": content,
                "reasoning_content": reasoning,
                "model": data.get("model", m["model_alias"]),
                "finish_reason": choices[0].get("finish_reason") if choices else None,
                "usage": data.get("usage"),
                "latency_ms": latency_ms,
            }
    except httpx.ConnectError:
        return {"success": False, "error": "Model server not reachable. Container may still be starting."}
    except httpx.TimeoutException:
        return {"success": False, "error": "Request timed out (60s). Model may still be loading weights."}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/model/health")
async def get_model_health(request: Request, model_id: str | None = None):
    await require_admin(request)
    if model_id:
        m = await get_model_by_id(model_id)
        if not m:
            raise HTTPException(status_code=404, detail="Model not found")
        endpoint = f"http://{m['container_alias']}:{m['port']}"
        container_name = m["container_name"]
    else:
        active_models = await get_active_models()
        if not active_models:
            return {"status": "no_active_models", "models": []}
        m = active_models[0]
        endpoint = f"http://{m['container_alias']}:{m['port']}"
        container_name = m["container_name"]

    server_up = False
    model_loaded = False
    http_latency_ms = 0
    error_msg = None

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            start = time.monotonic()
            resp = await client.get(f"{endpoint}/health")
            latency = (time.monotonic() - start) * 1000
            if resp.status_code < 500:
                server_up = True
                http_latency_ms = round(latency)

            if server_up:
                start = time.monotonic()
                resp2 = await client.get(f"{endpoint}/v1/models")
                latency2 = (time.monotonic() - start) * 1000
                if resp2.status_code == 200:
                    model_loaded = True
                    http_latency_ms = round(latency + latency2)
            else:
                error_msg = "sgfleet model not reachable"
    except httpx.ConnectError:
        error_msg = "sgfleet model connection refused"
    except httpx.TimeoutException:
        error_msg = "sgfleet model timed out"
    except Exception as e:
        error_msg = f"health check failed: {e}"

    if not server_up:
        status = "unreachable"
    elif not model_loaded:
        status = "loading"
    elif error_msg:
        status = "unhealthy"
    else:
        status = "healthy"

    # Keep the gateway registry in sync with the observed health so that a
    # model which came up late (or crashed and recovered) automatically
    # becomes routable / stops being routed to.
    if status == "healthy" and m.get("active"):
        mark_ready(m["model_id"])
    elif status in {"unreachable", "unhealthy"}:
        mark_not_ready(m["model_id"])

    container = await get_container_status(container_name)

    try:
        proc = psutil.Process(os.getpid())
        admin_memory_mb = round(proc.memory_info().rss / (1024 * 1024))
    except Exception:
        admin_memory_mb = 0
    admin_uptime_seconds = round(time.time() - _startup_time)

    return {
        "model_id": m["model_id"],
        "status": status,
        "server_up": server_up,
        "model_loaded": model_loaded,
        "http_latency_ms": http_latency_ms,
        "container": container,
        "admin": {
            "uptime_seconds": admin_uptime_seconds,
            "memory_mb": admin_memory_mb,
        },
        "error": error_msg,
        "last_checked": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


# --- Log Viewer Endpoints ---
@router.get("/logs")
async def get_admin_logs_route(
    request: Request,
    limit: int = 100,
    level: str | None = None,
    user: str | None = None,
    path: str | None = None,
    keyword: str | None = None,
):
    await require_admin(request)
    from .log_store import get_logs

    return await get_logs(limit=limit, level=level, user=user, path=path, keyword=keyword)


@router.get("/logs/config")
async def get_log_config(request: Request):
    await require_admin(request)
    from .log_store import get_log_level

    return {"level": await get_log_level()}


@router.patch("/logs/config")
async def update_log_config(request: Request):
    await require_admin(request)
    data = await request.json()
    level = data.get("level", "DEBUG")
    from .log_store import set_log_level

    await set_log_level(level)
    return {"level": level.upper()}


# --- HuggingFace Model Download Endpoints ---


@router.get("/download/gpus")
async def get_gpus(request: Request):
    await require_admin(request)
    from .hf_downloader import detect_gpus

    gpus = await detect_gpus()
    total_vram = sum(g["vram_gb"] for g in gpus)
    return {"gpus": gpus, "total_vram_gb": round(total_vram, 1)}


@router.get("/download/hf-token")
async def get_hf_token_endpoint(request: Request):
    await require_admin(request)
    from .hf_downloader import get_hf_token

    token = await get_hf_token()
    has_token = bool(token)
    masked = token[:8] + "..." if len(token) > 8 else ""
    return {"has_token": has_token, "masked_token": masked}


@router.post("/download/hf-token")
async def set_hf_token_endpoint(request: Request):
    await require_admin(request)
    from .hf_downloader import set_hf_token

    data = await request.json()
    token = data.get("token", "")
    await set_hf_token(token)
    return {"saved": True}


@router.get("/download/search")
async def search_hf_models_endpoint(
    request: Request,
    q: str = "",
    max_vram_gb: float | None = None,
    limit: int = 50,
):
    await require_admin(request)
    from .hf_downloader import get_hf_token, search_hf_models

    token = await get_hf_token()
    return await search_hf_models(query=q, max_vram_gb=max_vram_gb, has_token=bool(token), limit=limit)


@router.get("/download/disk-space")
async def get_disk_space(request: Request):
    await require_admin(request)
    from .hf_downloader import check_disk_space

    return await check_disk_space()


@router.get("/download/path-exists")
async def check_model_path(request: Request, path: str):
    await require_admin(request)
    from .docker_manager import CONTAINER_MODELS_DIR
    from .hf_downloader import check_model_path_exists

    real = os.path.realpath(CONTAINER_MODELS_DIR)
    abs_target = os.path.realpath(os.path.join(CONTAINER_MODELS_DIR, path))
    if not abs_target.startswith(real + os.sep) and abs_target != real:
        raise HTTPException(status_code=400, detail="path must be under MODELS_DIR")

    exists = await check_model_path_exists(abs_target)
    return {"exists": exists}


@router.post("/download/cleanup")
async def cleanup_model_path_endpoint(request: Request):
    await require_admin(request)
    from .docker_manager import CONTAINER_MODELS_DIR
    from .hf_downloader import cleanup_model_path

    data = await request.json()
    path = data.get("path", "")
    real = os.path.realpath(CONTAINER_MODELS_DIR)
    target = os.path.realpath(os.path.join(CONTAINER_MODELS_DIR, path))
    if not target.startswith(real + os.sep) and target != real:
        raise HTTPException(status_code=400, detail="Path must be under MODELS_DIR")
    cleaned = await cleanup_model_path(target)
    return {"cleaned": cleaned}


@router.get("/download/stream")
async def download_stream(request: Request, model_id: str, target_dir: str):
    await require_admin(request)
    from fastapi.responses import StreamingResponse

    from .docker_manager import CONTAINER_MODELS_DIR
    from .hf_downloader import get_hf_token, run_download

    if not target_dir:
        raise HTTPException(status_code=400, detail="target_dir is required")

    # Path traversal guard
    real = os.path.realpath(CONTAINER_MODELS_DIR)
    abs_target = os.path.realpath(os.path.join(CONTAINER_MODELS_DIR, target_dir))
    if not abs_target.startswith(real + os.sep) and abs_target != real:
        raise HTTPException(status_code=400, detail="target_dir must be under MODELS_DIR")

    token = await get_hf_token()

    async def event_generator():
        from .hf_downloader import ModelError as HFModelError

        progress_queue: asyncio.Queue[str] = asyncio.Queue()

        async def _progress(line: str):
            await progress_queue.put(line)

        try:
            yield f"data: {json.dumps({'type': 'start', 'model_id': model_id, 'target_dir': target_dir})}\n\n"
            yield f"data: {json.dumps({'type': 'log', 'line': 'Starting download...'})}\n\n"
            download_task = asyncio.create_task(run_download(model_id, abs_target, token, progress_fn=_progress))
            while True:
                try:
                    line = await asyncio.wait_for(progress_queue.get(), timeout=5.0)
                    yield f"data: {json.dumps({'type': 'log', 'line': line})}\n\n"
                except TimeoutError:
                    if download_task.done():
                        while not progress_queue.empty():
                            line = progress_queue.get_nowait()
                            yield f"data: {json.dumps({'type': 'log', 'line': line})}\n\n"
                        break
            await download_task
            yield f"data: {json.dumps({'type': 'complete', 'model_id': model_id, 'target_dir': target_dir})}\n\n"
        except HFModelError as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/download/model-config")
async def create_model_from_download(request: Request):
    await require_admin(request)
    from . import db as db_module
    from .docker_manager import CONTAINER_MODELS_DIR
    from .hf_downloader import generate_model_config

    data = await request.json()
    hf_model = data.get("hf_model", {})
    target_dir = data.get("target_dir", "")
    gpu_indices = data.get("gpu_indices", [])

    # Path traversal guard
    real = os.path.realpath(CONTAINER_MODELS_DIR)
    abs_target = os.path.realpath(os.path.join(CONTAINER_MODELS_DIR, target_dir))
    if not abs_target.startswith(real + os.sep) and abs_target != real:
        raise HTTPException(status_code=400, detail="target_dir must be under MODELS_DIR")

    config = generate_model_config(hf_model, abs_target, gpu_indices)
    await db_module.create_model(config)
    return {"model_id": config["model_id"], "config": config}

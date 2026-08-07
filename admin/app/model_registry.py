import time

from .db import get_active_models, get_all_models, get_model_by_id  # noqa: F401

_models_cache: dict[str, dict] = {}
_ready_ids: set[str] = set()
_health_cache: dict[str, dict] = {}
_first_active_endpoint: str | None = None
_first_active_time: float = 0.0
_FIRST_ACTIVE_TTL = 5.0


async def reload_cache() -> None:
    models = await get_all_models()
    _models_cache.clear()
    for m in models:
        _models_cache[m["model_id"]] = m
    # Invalidate the fast-path endpoint cache so it re-evaluates readiness.
    global _first_active_endpoint, _first_active_time  # noqa: PLW0603
    _first_active_endpoint = None
    _first_active_time = 0.0


def set_ready_ids(ready: set[str]) -> None:
    """Mark which model_ids have containers that passed the readiness probe.

    Only models present in this set will have their endpoint returned by the
    gateway helpers, preventing traffic from hitting an active-in-DB model
    whose container hasn't come up yet.
    """
    global _first_active_endpoint, _first_active_time  # noqa: PLW0603
    _ready_ids.clear()
    _ready_ids.update(ready)
    _first_active_endpoint = None
    _first_active_time = 0.0


def mark_ready(model_id: str) -> None:
    global _first_active_endpoint, _first_active_time  # noqa: PLW0603
    _ready_ids.add(model_id)
    _first_active_endpoint = None
    _first_active_time = 0.0


def mark_not_ready(model_id: str) -> None:
    global _first_active_endpoint, _first_active_time  # noqa: PLW0603
    _ready_ids.discard(model_id)
    _first_active_endpoint = None
    _first_active_time = 0.0


def is_ready(model_id: str) -> bool:
    return model_id in _ready_ids


def get_ready_ids() -> set[str]:
    return set(_ready_ids)


def get_all_models_cached() -> list[dict]:
    return list(_models_cache.values())


def get_model_cached(model_id: str) -> dict | None:
    return _models_cache.get(model_id)


def get_active_models_cached() -> list[dict]:
    """Return active models that also have a ready container."""
    return [m for m in _models_cache.values() if m.get("active") and m["model_id"] in _ready_ids]


def get_endpoint(model_id: str) -> str | None:
    model = _models_cache.get(model_id)
    if not model:
        return None
    if model_id not in _ready_ids:
        return None
    return f"http://{model['container_alias']}:{model['port']}"


def get_first_active_endpoint() -> str | None:
    for m in _models_cache.values():
        if m.get("active") and m["model_id"] in _ready_ids:
            return f"http://{m['container_alias']}:{m['port']}"
    return None


def get_cached_active_endpoint() -> str | None:
    global _first_active_endpoint, _first_active_time  # noqa: PLW0603
    now = time.monotonic()
    if now - _first_active_time > _FIRST_ACTIVE_TTL or _first_active_endpoint is None:
        _first_active_endpoint = get_first_active_endpoint()
        _first_active_time = now
    return _first_active_endpoint


def get_model_health_cache(model_id: str) -> dict:
    return _health_cache.get(model_id, {})


def set_model_health_cache(model_id: str, health: dict) -> None:
    _health_cache[model_id] = health

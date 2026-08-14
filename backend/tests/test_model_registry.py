import os

os.environ.setdefault("ADMIN_API_KEY", "test-secret-key-for-testing")

from app.model_registry import (
    get_active_models_cached,
    get_all_models_cached,
    get_endpoint,
    get_model_cached,
    get_ready_ids,
    is_ready,
    mark_not_ready,
    mark_ready,
    set_ready_ids,
)


def test_ready_ids_empty_by_default():
    set_ready_ids(set())
    assert get_ready_ids() == set()
    assert not is_ready("any-model")


def test_mark_ready():
    set_ready_ids(set())
    mark_ready("model-a")
    assert is_ready("model-a")
    assert not is_ready("model-b")
    assert get_ready_ids() == {"model-a"}


def test_mark_not_ready():
    set_ready_ids({"model-a", "model-b"})
    mark_not_ready("model-a")
    assert not is_ready("model-a")
    assert is_ready("model-b")


def test_set_ready_ids_overwrites():
    set_ready_ids({"a", "b", "c"})
    set_ready_ids({"d"})
    assert get_ready_ids() == {"d"}
    assert not is_ready("a")


def test_get_all_models_cached_empty():
    from app.model_registry import _models_cache

    _models_cache.clear()
    assert get_all_models_cached() == []


def test_get_model_cached_hit():
    from app.model_registry import _models_cache

    _models_cache.clear()
    _models_cache["test-model"] = {"model_id": "test-model", "name": "Test"}
    result = get_model_cached("test-model")
    assert result is not None
    assert result["name"] == "Test"


def test_get_model_cached_miss():
    from app.model_registry import _models_cache

    _models_cache.clear()
    assert get_model_cached("missing") is None


def test_get_endpoint_not_ready():
    from app.model_registry import _models_cache

    _models_cache.clear()
    _models_cache["m1"] = {
        "model_id": "m1",
        "container_alias": "sgfleet-m1",
        "port": 30000,
        "active": True,
    }
    set_ready_ids(set())
    assert get_endpoint("m1") is None


def test_get_endpoint_ready():
    from app.model_registry import _models_cache

    _models_cache.clear()
    _models_cache["m1"] = {
        "model_id": "m1",
        "container_alias": "sgfleet-m1",
        "port": 30000,
        "active": True,
    }
    set_ready_ids({"m1"})
    assert get_endpoint("m1") == "http://sgfleet-m1:30000"


def test_get_endpoint_missing_model():
    from app.model_registry import _models_cache

    _models_cache.clear()
    set_ready_ids({"missing"})
    assert get_endpoint("missing") is None


def test_get_active_models_cached():
    from app.model_registry import _models_cache

    _models_cache.clear()
    _models_cache["a"] = {"model_id": "a", "active": True}
    _models_cache["b"] = {"model_id": "b", "active": True}
    _models_cache["c"] = {"model_id": "c", "active": False}
    set_ready_ids({"a"})
    result = get_active_models_cached()
    assert len(result) == 1
    assert result[0]["model_id"] == "a"


def test_set_ready_ids_invalidates_endpoint():
    from app.model_registry import _models_cache, get_first_active_endpoint

    _models_cache.clear()
    _models_cache["m1"] = {"model_id": "m1", "active": True, "container_alias": "sgfleet-m1", "port": 30000}
    set_ready_ids({"m1"})
    ep = get_first_active_endpoint()
    assert ep == "http://sgfleet-m1:30000"

    set_ready_ids(set())
    assert get_first_active_endpoint() is None

import sqlite3

import pytest
from app.db import (
    create_model,
    create_user,
    delete_model,
    export_models_to_dict,
    get_active_models,
    get_all_models,
    get_model_by_id,
    get_model_versions,
    get_model_versions_for_field,
    get_user_default_model,
    get_user_model_access,
    save_model_version,
    set_pending_restart,
    set_user_default_model,
    set_user_model_access,
    update_model,
    update_user,
)

# ── Model data helpers ──────────────────────────────────────────────


def _model_data(mid="test-model-1", active=0):
    return {
        "model_id": mid,
        "name": f"Model {mid}",
        "image": "lmsysorg/sglang:v0.5.16",
        "model_path": f"/models/{mid}",
        "context_length": 4096,
        "max_output_length": 2048,
        "port": 30000,
        "container_name": f"sgfleet-{mid}",
        "container_alias": f"sgfleet-{mid}",
        "model_alias": "sgfleet-api-model",
        "active": active,
        "grace_period": 10,
        "environment": {"CUDA_VISIBLE_DEVICES": "0"},
        "gpu": "auto",
        "command_flags": ["--enable-metrics"],
    }


# ── get_all_models ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_all_models_empty():
    models = await get_all_models()
    assert models == []


@pytest.mark.asyncio
async def test_get_all_models_returns_created():
    data = _model_data()
    await create_model(data)
    models = await get_all_models()
    assert len(models) == 1
    m = models[0]
    assert m["model_id"] == "test-model-1"
    assert m["name"] == "Model test-model-1"
    assert m["active"] is False
    assert m["pending_restart"] is False
    assert m["environment"] == {"CUDA_VISIBLE_DEVICES": "0"}
    assert m["command_flags"] == ["--enable-metrics"]


@pytest.mark.asyncio
async def test_get_all_models_multiple_ordered_by_id():
    for i in range(3):
        await create_model(_model_data(f"m-{i}"))
    models = await get_all_models()
    assert len(models) == 3
    ids = [m["model_id"] for m in models]
    assert ids == ["m-0", "m-1", "m-2"]


@pytest.mark.asyncio
async def test_get_all_models_boolean_coercion():
    data = _model_data(active=1)
    await create_model(data)
    models = await get_all_models()
    assert models[0]["active"] is True
    assert isinstance(models[0]["active"], bool)


# ── get_model_by_id ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_model_by_id_not_found():
    assert await get_model_by_id("nonexistent") is None


@pytest.mark.asyncio
async def test_get_model_by_id_returns_model():
    data = _model_data()
    await create_model(data)
    m = await get_model_by_id("test-model-1")
    assert m is not None
    assert m["model_id"] == "test-model-1"
    assert m["context_length"] == 4096


@pytest.mark.asyncio
async def test_get_model_by_id_json_fields_parsed():
    data = _model_data()
    data["environment"] = {"KEY": "val", "NUM": "42"}
    data["command_flags"] = ["--port", "8080", "--chunked-prefill-size 4096"]
    await create_model(data)
    m = await get_model_by_id("test-model-1")
    assert m["environment"] == {"KEY": "val", "NUM": "42"}
    assert m["command_flags"] == ["--port", "8080", "--chunked-prefill-size", "4096"]


# ── get_active_models ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_active_models_empty():
    assert await get_active_models() == []


@pytest.mark.asyncio
async def test_get_active_models_filters_inactive():
    await create_model(_model_data("inactive", active=0))
    await create_model(_model_data("active-one", active=1))
    active = await get_active_models()
    assert len(active) == 1
    assert active[0]["model_id"] == "active-one"


@pytest.mark.asyncio
async def test_get_active_models_multiple():
    await create_model(_model_data("a1", active=1))
    await create_model(_model_data("a2", active=1))
    await create_model(_model_data("a3-inactive", active=0))
    active = await get_active_models()
    ids = {m["model_id"] for m in active}
    assert ids == {"a1", "a2"}


# ── create_model ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_model_returns_full_model():
    data = _model_data()
    result = await create_model(data)
    assert result["model_id"] == "test-model-1"
    assert result["context_length"] == 4096
    assert result["max_output_length"] == 2048
    assert result["port"] == 30000


@pytest.mark.asyncio
async def test_create_model_defaults():
    minimal = {
        "model_id": "minimal-m",
        "name": "Minimal",
        "image": "img",
        "model_path": "/p",
        "context_length": 1024,
        "max_output_length": 512,
        "container_name": "cn",
        "container_alias": "ca",
    }
    result = await create_model(minimal)
    assert result["port"] == 30000
    assert result["model_alias"] == "sgfleet-api-model"
    assert result["active"] is False
    assert result["grace_period"] == 10
    assert result["gpu"] == "auto"
    assert result["environment"] == {}
    assert result["command_flags"] == []


@pytest.mark.asyncio
async def test_create_model_active_true():
    data = _model_data(active=1)
    result = await create_model(data)
    assert result["active"] is True


@pytest.mark.asyncio
async def test_create_model_normalizes_command_flags():
    data = _model_data()
    data["command_flags"] = ["--port 9090", "--flag"]
    result = await create_model(data)
    assert result["command_flags"] == ["--port", "9090", "--flag"]


@pytest.mark.asyncio
async def test_create_model_creates_version():
    data = _model_data()
    await create_model(data)
    versions = await get_model_versions("test-model-1")
    assert len(versions) == 1
    assert versions[0]["version"] == 1
    assert versions[0]["snapshot"]["name"] == "Model test-model-1"


# ── update_model ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_update_model_name():
    await create_model(_model_data())
    await update_model("test-model-1", {"name": "Updated Name"})
    m = await get_model_by_id("test-model-1")
    assert m["name"] == "Updated Name"


@pytest.mark.asyncio
async def test_update_model_active_flag():
    await create_model(_model_data(active=0))
    await update_model("test-model-1", {"active": True})
    m = await get_model_by_id("test-model-1")
    assert m["active"] is True


@pytest.mark.asyncio
async def test_update_model_partial_no_overwrite():
    data = _model_data()
    data["context_length"] = 8192
    await create_model(data)
    await update_model("test-model-1", {"name": "New Name"})
    m = await get_model_by_id("test-model-1")
    assert m["name"] == "New Name"
    assert m["context_length"] == 8192


@pytest.mark.asyncio
async def test_update_model_environment():
    await create_model(_model_data())
    await update_model("test-model-1", {"environment": {"A": "1", "B": "2"}})
    m = await get_model_by_id("test-model-1")
    assert m["environment"] == {"A": "1", "B": "2"}


@pytest.mark.asyncio
async def test_update_model_command_flags():
    await create_model(_model_data())
    await update_model("test-model-1", {"command_flags": ["--enable-metrics", "--port 8080"]})
    m = await get_model_by_id("test-model-1")
    assert m["command_flags"] == ["--enable-metrics", "--port", "8080"]


@pytest.mark.asyncio
async def test_update_model_gpu():
    await create_model(_model_data())
    await update_model("test-model-1", {"gpu": "0"})
    m = await get_model_by_id("test-model-1")
    assert m["gpu"] == "0"


@pytest.mark.asyncio
async def test_update_model_creates_new_version():
    await create_model(_model_data())
    await update_model("test-model-1", {"name": "v2"})
    versions = await get_model_versions("test-model-1")
    assert len(versions) == 2
    assert versions[0]["version"] == 2
    assert versions[0]["snapshot"]["name"] == "v2"


@pytest.mark.asyncio
async def test_update_model_sets_pending_restart_on_image_change():
    await create_model(_model_data())
    await update_model("test-model-1", {"image": "new-image:v2"})
    m = await get_model_by_id("test-model-1")
    assert m["pending_restart"] is True


@pytest.mark.asyncio
async def test_update_model_no_pending_restart_on_name_only():
    await create_model(_model_data())
    await update_model("test-model-1", {"name": "Renamed"})
    m = await get_model_by_id("test-model-1")
    assert m["pending_restart"] is False


@pytest.mark.asyncio
async def test_update_model_nonexistent_id_no_error():
    await update_model("does-not-exist", {"name": "X"})


@pytest.mark.asyncio
async def test_update_model_port():
    await create_model(_model_data())
    await update_model("test-model-1", {"port": 40000})
    m = await get_model_by_id("test-model-1")
    assert m["port"] == 40000


@pytest.mark.asyncio
async def test_update_model_context_length():
    await create_model(_model_data())
    await update_model("test-model-1", {"context_length": 65536})
    m = await get_model_by_id("test-model-1")
    assert m["context_length"] == 65536


@pytest.mark.asyncio
async def test_update_model_container_alias():
    await create_model(_model_data())
    await update_model("test-model-1", {"container_alias": "new-alias"})
    m = await get_model_by_id("test-model-1")
    assert m["container_alias"] == "new-alias"


# ── delete_model ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_delete_model_removes_model():
    await create_model(_model_data())
    await delete_model("test-model-1")
    assert await get_model_by_id("test-model-1") is None


@pytest.mark.asyncio
async def test_delete_model_removes_user_access():
    user = await create_user("del-user", "sk-del")
    uid = user["id"]
    await create_model(_model_data("m-a"))
    await set_user_model_access(uid, ["m-a"])
    access = await get_user_model_access(uid)
    assert len(access) == 1
    await delete_model("m-a")
    access = await get_user_model_access(uid)
    assert len(access) == 0


@pytest.mark.asyncio
async def test_delete_model_clears_user_default():
    user = await create_user("def-user", "sk-def")
    uid = user["id"]
    await create_model(_model_data("m-def"))
    await set_user_default_model(uid, "m-def")
    default = await get_user_default_model(uid)
    assert default is not None
    await delete_model("m-def")
    default = await get_user_default_model(uid)
    assert default is None


@pytest.mark.asyncio
async def test_delete_model_removes_versions():
    await create_model(_model_data())
    await update_model("test-model-1", {"name": "v2"})
    versions = await get_model_versions("test-model-1")
    assert len(versions) == 2
    await delete_model("test-model-1")
    versions = await get_model_versions("test-model-1")
    assert len(versions) == 0


@pytest.mark.asyncio
async def test_delete_nonexistent_model_no_error():
    await delete_model("nonexistent-model")


# ── get_user_model_access / set_user_model_access ──────────────────


@pytest.mark.asyncio
async def test_user_model_access_empty():
    user = await create_user("access-user", "sk-access")
    uid = user["id"]
    access = await get_user_model_access(uid)
    assert access == []


@pytest.mark.asyncio
async def test_set_user_model_access():
    user = await create_user("access-user2", "sk-a2")
    uid = user["id"]
    await create_model(_model_data("m-x"))
    await create_model(_model_data("m-y"))
    await set_user_model_access(uid, ["m-x", "m-y"])
    access = await get_user_model_access(uid)
    ids = {m["model_id"] for m in access}
    assert ids == {"m-x", "m-y"}


@pytest.mark.asyncio
async def test_set_user_model_access_replaces():
    user = await create_user("access-user3", "sk-a3")
    uid = user["id"]
    await create_model(_model_data("m-r1"))
    await create_model(_model_data("m-r2"))
    await set_user_model_access(uid, ["m-r1"])
    await set_user_model_access(uid, ["m-r2"])
    access = await get_user_model_access(uid)
    assert len(access) == 1
    assert access[0]["model_id"] == "m-r2"


@pytest.mark.asyncio
async def test_set_user_model_access_skips_nonexistent():
    user = await create_user("access-user4", "sk-a4")
    uid = user["id"]
    await create_model(_model_data("m-real"))
    await set_user_model_access(uid, ["m-real", "m-fake"])
    access = await get_user_model_access(uid)
    assert len(access) == 1
    assert access[0]["model_id"] == "m-real"


@pytest.mark.asyncio
async def test_set_user_model_access_empty_list():
    user = await create_user("access-user5", "sk-a5")
    uid = user["id"]
    await create_model(_model_data("m-empty"))
    await set_user_model_access(uid, ["m-empty"])
    await set_user_model_access(uid, [])
    access = await get_user_model_access(uid)
    assert access == []


# ── set_user_default_model / get_user_default_model ────────────────


@pytest.mark.asyncio
async def test_user_default_model_none_initial():
    user = await create_user("def-default", "sk-dd")
    uid = user["id"]
    default = await get_user_default_model(uid)
    assert default is None


@pytest.mark.asyncio
async def test_set_user_default_model():
    user = await create_user("def-set", "sk-ds")
    uid = user["id"]
    await create_model(_model_data("m-default"))
    await set_user_default_model(uid, "m-default")
    default = await get_user_default_model(uid)
    assert default is not None
    assert default["model_id"] == "m-default"


@pytest.mark.asyncio
async def test_set_user_default_model_clears_with_none():
    user = await create_user("def-clear", "sk-dc")
    uid = user["id"]
    await create_model(_model_data("m-to-clear"))
    await set_user_default_model(uid, "m-to-clear")
    await set_user_default_model(uid, None)
    default = await get_user_default_model(uid)
    assert default is None


@pytest.mark.asyncio
async def test_set_user_default_model_raises_for_nonexistent():
    user = await create_user("def-raise", "sk-dr")
    uid = user["id"]
    with pytest.raises(ValueError, match="not found"):
        await set_user_default_model(uid, "nonexistent-model")


@pytest.mark.asyncio
async def test_set_user_default_model_changes_default():
    user = await create_user("def-change", "sk-dch")
    uid = user["id"]
    await create_model(_model_data("m-first"))
    await create_model(_model_data("m-second"))
    await set_user_default_model(uid, "m-first")
    assert (await get_user_default_model(uid))["model_id"] == "m-first"
    await set_user_default_model(uid, "m-second")
    assert (await get_user_default_model(uid))["model_id"] == "m-second"


# ── save_model_version / get_model_versions ────────────────────────


@pytest.mark.asyncio
async def test_save_model_version():
    await create_model(_model_data())
    snapshot = {"model_id": "test-model-1", "name": "Manual", "image": "x"}
    ver = await save_model_version("test-model-1", snapshot)
    assert ver >= 1


@pytest.mark.asyncio
async def test_get_model_versions_order_desc():
    await create_model(_model_data())
    await update_model("test-model-1", {"name": "v2"})
    await update_model("test-model-1", {"name": "v3"})
    versions = await get_model_versions("test-model-1")
    assert len(versions) == 3
    assert versions[0]["version"] == 3
    assert versions[0]["snapshot"]["name"] == "v3"
    assert versions[-1]["version"] == 1


@pytest.mark.asyncio
async def test_get_model_versions_empty_for_nonexistent():
    versions = await get_model_versions("no-such-model")
    assert versions == []


@pytest.mark.asyncio
async def test_get_model_versions_includes_created_at():
    await create_model(_model_data())
    versions = await get_model_versions("test-model-1")
    assert versions[0]["created_at"] is not None


# ── get_model_versions_for_field ───────────────────────────────────


@pytest.mark.asyncio
async def test_model_versions_for_field_name():
    await create_model(_model_data())
    await update_model("test-model-1", {"name": "A"})
    await update_model("test-model-1", {"name": "B"})
    await update_model("test-model-1", {"name": "A"})
    field_vers = await get_model_versions_for_field("test-model-1", "name")
    names = [v["value"] for v in field_vers]
    assert names == ["A", "B", "Model test-model-1"]


@pytest.mark.asyncio
async def test_model_versions_for_field_no_dups():
    await create_model(_model_data())
    await update_model("test-model-1", {"name": "same"})
    await update_model("test-model-1", {"name": "same"})
    field_vers = await get_model_versions_for_field("test-model-1", "name")
    vals = [v["value"] for v in field_vers]
    assert vals.count("same") == 1


@pytest.mark.asyncio
async def test_model_versions_for_field_missing_field():
    await create_model(_model_data())
    field_vers = await get_model_versions_for_field("test-model-1", "nonexistent_field")
    field_vers_filtered = [v for v in field_vers if v["value"] is not None]
    assert field_vers_filtered == []


@pytest.mark.asyncio
async def test_model_versions_for_field_environment_dedup():
    await create_model(_model_data())
    await update_model("test-model-1", {"environment": {"K": "1"}})
    await update_model("test-model-1", {"environment": {"K": "1"}})
    field_vers = await get_model_versions_for_field("test-model-1", "environment")
    k1_vals = [v["value"] for v in field_vers if v["value"] == {"K": "1"}]
    assert len(k1_vals) == 1


@pytest.mark.asyncio
async def test_model_versions_for_field_context_length():
    await create_model(_model_data())
    await update_model("test-model-1", {"context_length": 8192})
    field_vers = await get_model_versions_for_field("test-model-1", "context_length")
    vals = [v["value"] for v in field_vers]
    assert 8192 in vals
    assert 4096 in vals


# ── Version pruning ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_version_pruning_keeps_max_versions():
    await create_model(_model_data())
    for i in range(15):
        await update_model("test-model-1", {"name": f"v{i}"})
    versions = await get_model_versions("test-model-1")
    assert len(versions) <= 10


# ── export_models_to_dict ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_export_models_empty():
    result = await export_models_to_dict()
    assert result == []


@pytest.mark.asyncio
async def test_export_models_contains_all_fields():
    await create_model(_model_data())
    result = await export_models_to_dict()
    assert len(result) == 1
    m = result[0]
    assert m["id"] == "test-model-1"
    assert m["name"] == "Model test-model-1"
    assert m["image"] == "lmsysorg/sglang:v0.5.16"
    assert m["model_path"] == "/models/test-model-1"
    assert m["context_length"] == 4096
    assert m["max_output_length"] == 2048
    assert m["port"] == 30000
    assert m["container_name"] == "sgfleet-test-model-1"
    assert m["container_alias"] == "sgfleet-test-model-1"
    assert m["model_alias"] == "sgfleet-api-model"
    assert m["active"] is False
    assert m["grace_period"] == 10
    assert m["environment"] == {"CUDA_VISIBLE_DEVICES": "0"}
    assert m["gpu"] == "auto"
    assert m["command_flags"] == ["--enable-metrics"]


@pytest.mark.asyncio
async def test_export_models_multiple():
    await create_model(_model_data("e1"))
    await create_model(_model_data("e2"))
    result = await export_models_to_dict()
    assert len(result) == 2
    ids = {m["id"] for m in result}
    assert ids == {"e1", "e2"}


# ── set_pending_restart ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_set_pending_restart_true():
    await create_model(_model_data())
    await set_pending_restart("test-model-1", True)
    m = await get_model_by_id("test-model-1")
    assert m["pending_restart"] is True


@pytest.mark.asyncio
async def test_set_pending_restart_false():
    await create_model(_model_data())
    await set_pending_restart("test-model-1", True)
    await set_pending_restart("test-model-1", False)
    m = await get_model_by_id("test-model-1")
    assert m["pending_restart"] is False


# ── Edge cases: create_user duplicate, update_user nonexistent ─────


@pytest.mark.asyncio
async def test_create_user_duplicate_name_raises():
    await create_user("duplicate", "sk-key-1")
    with pytest.raises(sqlite3.IntegrityError):
        await create_user("duplicate", "sk-key-2")


@pytest.mark.asyncio
async def test_update_user_nonexistent_id_no_error():
    await update_user(99999, name="no-one")

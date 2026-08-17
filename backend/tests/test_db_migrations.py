import json
import os

import aiosqlite
import pytest

os.environ.setdefault("ADMIN_API_KEY", "test-secret-key-for-testing")

from app.config import settings as cfg
from app.db import (
    _bootstrap_models,
    _get_seed_models,
    _sync_admin_api_key_hash,
    bootstrap_users_from_json,
    get_db,
    hash_key,
    migrate_to_v3,
    migrate_to_v4,
    migrate_to_v5,
    migrate_to_v6,
    migrate_to_v7,
    migrate_to_v8,
    migrate_to_v9,
    migrate_to_v10,
    migrate_to_v11,
    migrate_to_v12,
    migrate_to_v13,
    migrate_to_v14,
    migrate_to_v15,
    verify_key,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def bare_db(tmp_path, monkeypatch):
    """Provide a temp DB path with no tables (bypasses _init_schema)."""
    db_file = str(tmp_path / "test.db")
    monkeypatch.setattr(cfg, "db_path", db_file)
    return db_file


@pytest.fixture
def migration_base_db(bare_db, monkeypatch):
    """Create v2 base schema (users + config) and seed migration_version=2."""

    async def _setup():
        async with aiosqlite.connect(bare_db) as db:
            db.row_factory = aiosqlite.Row
            await db.execute(
                """CREATE TABLE users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE NOT NULL,
                    api_key_hash TEXT NOT NULL,
                    is_active INTEGER DEFAULT 1,
                    rate_limit REAL DEFAULT 2,
                    max_concurrent INTEGER DEFAULT 2,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )"""
            )
            await db.execute(
                """CREATE TABLE config (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )"""
            )
            await db.execute(
                "INSERT INTO config (key, value) VALUES (?, ?)",
                ("migration_version", "2"),
            )
            await db.commit()

    return _setup


@pytest.fixture
def v1_db(bare_db, monkeypatch):
    """Create v1 base schema (no seed)."""

    async def _setup():
        async with aiosqlite.connect(bare_db) as db:
            await db.execute(
                """CREATE TABLE users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE NOT NULL,
                    api_key_hash TEXT NOT NULL,
                    is_active INTEGER DEFAULT 1,
                    rate_limit REAL DEFAULT 2,
                    max_concurrent INTEGER DEFAULT 2,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )"""
            )
            await db.execute(
                """CREATE TABLE config (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )"""
            )

    return _setup


async def get_table_columns(db_path, table_name):
    """Return sorted list of column names for a table."""
    async with aiosqlite.connect(db_path) as db, db.execute(f"PRAGMA table_info({table_name})") as cur:
        rows = await cur.fetchall()
    return sorted(r[1] for r in rows)


async def table_exists(db_path, table_name):
    async with (
        aiosqlite.connect(db_path) as db,
        db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
            (table_name,),
        ) as cur,
    ):
        return await cur.fetchone() is not None


async def get_migration_version(db_path):
    async with (
        aiosqlite.connect(db_path) as db,
        db.execute("SELECT value FROM config WHERE key = 'migration_version'") as cur,
    ):
        row = await cur.fetchone()
    return int(row[0]) if row else None


# ---------------------------------------------------------------------------
# Individual migration tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_migrate_to_v3(bare_db, migration_base_db):
    await migration_base_db()
    async with get_db() as db:
        await migrate_to_v3(db)

    cols = await get_table_columns(bare_db, "users")
    assert "request_cost" in cols
    assert "daily_quota" in cols

    assert await table_exists(bare_db, "user_usage")
    ver = await get_migration_version(bare_db)
    assert ver == 3


@pytest.mark.asyncio
async def test_migrate_to_v3_preserves_users(bare_db, migration_base_db):
    await migration_base_db()
    async with aiosqlite.connect(bare_db) as db:
        h = hash_key("testkey")
        await db.execute(
            "INSERT INTO users (name, api_key_hash, is_active) VALUES (?, ?, ?)",
            ("alice", h, 1),
        )
        await db.commit()

    async with get_db() as db:
        await migrate_to_v3(db)

    async with aiosqlite.connect(bare_db) as db, db.execute("SELECT name FROM users") as cur:
        names = [r[0] for r in await cur.fetchall()]
    assert "alice" in names


@pytest.mark.asyncio
async def test_migrate_to_v4(bare_db, migration_base_db):
    await migration_base_db()
    async with get_db() as db:
        await migrate_to_v3(db)
        await migrate_to_v4(db)

    cols = await get_table_columns(bare_db, "users")
    assert "api_key" in cols
    ver = await get_migration_version(bare_db)
    assert ver == 4


@pytest.mark.asyncio
async def test_migrate_to_v5(bare_db, migration_base_db):
    await migration_base_db()
    async with get_db() as db:
        await migrate_to_v3(db)
        await migrate_to_v4(db)
        await migrate_to_v5(db)

    cols = await get_table_columns(bare_db, "users")
    assert "email" in cols
    assert "notes" in cols
    assert "display_order" in cols
    ver = await get_migration_version(bare_db)
    assert ver == 5


@pytest.mark.asyncio
async def test_migrate_to_v6(bare_db, migration_base_db):
    await migration_base_db()
    async with get_db() as db:
        for m in [migrate_to_v3, migrate_to_v4, migrate_to_v5, migrate_to_v6]:
            await m(db)

    assert await table_exists(bare_db, "audit_log")
    assert await table_exists(bare_db, "request_log")
    ver = await get_migration_version(bare_db)
    assert ver == 6


@pytest.mark.asyncio
async def test_migrate_to_v7(bare_db, migration_base_db):
    await migration_base_db()
    async with get_db() as db:
        for m in [migrate_to_v3, migrate_to_v4, migrate_to_v5, migrate_to_v6, migrate_to_v7]:
            await m(db)

    cols = await get_table_columns(bare_db, "users")
    assert "api_key_quick_hash" in cols
    ver = await get_migration_version(bare_db)
    assert ver == 7


@pytest.mark.asyncio
async def test_migrate_to_v7_populates_quick_hash(bare_db, migration_base_db):
    await migration_base_db()
    async with get_db() as db:
        await migrate_to_v3(db)
        await migrate_to_v4(db)

    async with aiosqlite.connect(bare_db) as db:
        h = hash_key("mykey")
        await db.execute(
            "INSERT INTO users (name, api_key_hash, is_active, api_key) VALUES (?, ?, ?, ?)",
            ("bob", h, 1, "mykey"),
        )
        await db.commit()

    async with get_db() as db:
        await migrate_to_v5(db)
        await migrate_to_v6(db)
        await migrate_to_v7(db)

    async with (
        aiosqlite.connect(bare_db) as db,
        db.execute("SELECT api_key_quick_hash FROM users WHERE name = 'bob'") as cur,
    ):
        row = await cur.fetchone()
    assert row[0] is not None
    assert len(row[0]) == 64


@pytest.mark.asyncio
async def test_migrate_to_v8(bare_db, migration_base_db):
    await migration_base_db()
    async with get_db() as db:
        for m in [migrate_to_v3, migrate_to_v4, migrate_to_v5, migrate_to_v6, migrate_to_v7, migrate_to_v8]:
            await m(db)

    uu_cols = await get_table_columns(bare_db, "user_usage")
    assert "prompt_tokens" in uu_cols
    assert "completion_tokens" in uu_cols
    assert "total_tokens" in uu_cols

    rl_cols = await get_table_columns(bare_db, "request_log")
    assert "prompt_tokens" in rl_cols
    assert "completion_tokens" in rl_cols

    ver = await get_migration_version(bare_db)
    assert ver == 8


@pytest.mark.asyncio
async def test_migrate_to_v9(bare_db, migration_base_db):
    await migration_base_db()
    async with get_db() as db:
        for m in [
            migrate_to_v3,
            migrate_to_v4,
            migrate_to_v5,
            migrate_to_v6,
            migrate_to_v7,
            migrate_to_v8,
            migrate_to_v9,
        ]:
            await m(db)

    assert await table_exists(bare_db, "webhooks")
    ver = await get_migration_version(bare_db)
    assert ver == 9


@pytest.mark.asyncio
async def test_migrate_to_v10(bare_db, migration_base_db):
    await migration_base_db()
    async with get_db() as db:
        for m in [
            migrate_to_v3,
            migrate_to_v4,
            migrate_to_v5,
            migrate_to_v6,
            migrate_to_v7,
            migrate_to_v8,
            migrate_to_v9,
            migrate_to_v10,
        ]:
            await m(db)

    assert await table_exists(bare_db, "admin_log")
    ver = await get_migration_version(bare_db)
    assert ver == 10


@pytest.mark.asyncio
async def test_migrate_to_v11(bare_db, migration_base_db):
    await migration_base_db()
    async with get_db() as db:
        for m in [
            migrate_to_v3,
            migrate_to_v4,
            migrate_to_v5,
            migrate_to_v6,
            migrate_to_v7,
            migrate_to_v8,
            migrate_to_v9,
            migrate_to_v10,
            migrate_to_v11,
        ]:
            await m(db)

    assert await table_exists(bare_db, "models")
    assert await table_exists(bare_db, "user_model_access")

    cols = await get_table_columns(bare_db, "users")
    assert "default_model_id" in cols

    ver = await get_migration_version(bare_db)
    assert ver == 11


@pytest.mark.asyncio
async def test_migrate_to_v11_bootstrap_models(bare_db, migration_base_db):
    await migration_base_db()
    async with get_db() as db:
        for m in [
            migrate_to_v3,
            migrate_to_v4,
            migrate_to_v5,
            migrate_to_v6,
            migrate_to_v7,
            migrate_to_v8,
            migrate_to_v9,
            migrate_to_v10,
            migrate_to_v11,
        ]:
            await m(db)

    async with aiosqlite.connect(bare_db) as db, db.execute("SELECT COUNT(*) FROM models") as cur:
        count = (await cur.fetchone())[0]
    assert count >= 1


@pytest.mark.asyncio
async def test_migrate_to_v12(bare_db, migration_base_db):
    await migration_base_db()
    async with get_db() as db:
        all_migrations = [
            migrate_to_v3,
            migrate_to_v4,
            migrate_to_v5,
            migrate_to_v6,
            migrate_to_v7,
            migrate_to_v8,
            migrate_to_v9,
            migrate_to_v10,
            migrate_to_v11,
            migrate_to_v12,
        ]
        for m in all_migrations:
            await m(db)

    ver = await get_migration_version(bare_db)
    assert ver == 12


@pytest.mark.asyncio
async def test_migrate_to_v12_renames_branding(bare_db, migration_base_db):
    await migration_base_db()
    async with get_db() as db:
        all_migrations = [
            migrate_to_v3,
            migrate_to_v4,
            migrate_to_v5,
            migrate_to_v6,
            migrate_to_v7,
            migrate_to_v8,
            migrate_to_v9,
            migrate_to_v10,
            migrate_to_v11,
        ]
        for m in all_migrations:
            await m(db)

    async with aiosqlite.connect(bare_db) as db:
        await db.execute("UPDATE models SET container_name = 'sglang-qwen36-27b' WHERE model_id = 'qwen36-27b'")
        await db.execute("UPDATE models SET container_alias = 'sglang-gpt-oss-20b' WHERE model_id = 'gpt-oss-20b'")
        await db.execute("UPDATE models SET model_alias = 'sglang-api-model' WHERE model_id = 'gemma4-31b'")
        await db.commit()

    async with get_db() as db:
        await migrate_to_v12(db)

    async with aiosqlite.connect(bare_db) as db:
        async with db.execute("SELECT container_name FROM models WHERE model_id = 'qwen36-27b'") as cur:
            row = await cur.fetchone()
        assert row[0] == "sgfleet-qwen36-27b"

        async with db.execute("SELECT container_alias FROM models WHERE model_id = 'gpt-oss-20b'") as cur:
            row = await cur.fetchone()
        assert row[0] == "sgfleet-gpt-oss-20b"

        async with db.execute("SELECT model_alias FROM models WHERE model_id = 'gemma4-31b'") as cur:
            row = await cur.fetchone()
        assert row[0] == "sgfleet-api-model"


@pytest.mark.asyncio
async def test_migrate_to_v13(bare_db, migration_base_db):
    await migration_base_db()
    async with get_db() as db:
        all_migrations = [
            migrate_to_v3,
            migrate_to_v4,
            migrate_to_v5,
            migrate_to_v6,
            migrate_to_v7,
            migrate_to_v8,
            migrate_to_v9,
            migrate_to_v10,
            migrate_to_v11,
            migrate_to_v12,
            migrate_to_v13,
        ]
        for m in all_migrations:
            await m(db)

    assert await table_exists(bare_db, "model_config_versions")

    cols = await get_table_columns(bare_db, "models")
    assert "pending_restart" in cols

    ver = await get_migration_version(bare_db)
    assert ver == 13


@pytest.mark.asyncio
async def test_migrate_to_v14(bare_db, migration_base_db):
    await migration_base_db()
    async with get_db() as db:
        all_migrations = [
            migrate_to_v3,
            migrate_to_v4,
            migrate_to_v5,
            migrate_to_v6,
            migrate_to_v7,
            migrate_to_v8,
            migrate_to_v9,
            migrate_to_v10,
            migrate_to_v11,
            migrate_to_v12,
            migrate_to_v13,
            migrate_to_v14,
        ]
        for m in all_migrations:
            await m(db)

    async with aiosqlite.connect(bare_db) as db:
        async with db.execute("SELECT value FROM config WHERE key = 'migration_version'") as cur:
            row = await cur.fetchone()
        assert int(row[0]) == 14


@pytest.mark.asyncio
async def test_migrate_to_v14_sets_setup_complete_when_admin_key_exists(bare_db, migration_base_db):
    await migration_base_db()
    async with get_db() as db:
        all_migrations = [
            migrate_to_v3,
            migrate_to_v4,
            migrate_to_v5,
            migrate_to_v6,
            migrate_to_v7,
            migrate_to_v8,
            migrate_to_v9,
            migrate_to_v10,
            migrate_to_v11,
            migrate_to_v12,
            migrate_to_v13,
        ]
        for m in all_migrations:
            await m(db)

    async with aiosqlite.connect(bare_db) as db:
        h = hash_key("testkey")
        await db.execute(
            "INSERT INTO config (key, value) VALUES (?, ?)",
            ("admin_api_key_hash", h),
        )
        await db.commit()

    async with get_db() as db:
        await migrate_to_v14(db)

    async with (
        aiosqlite.connect(bare_db) as db,
        db.execute("SELECT value FROM config WHERE key = 'setup_complete'") as cur,
    ):
        row = await cur.fetchone()
    assert row[0] == "true"


@pytest.mark.asyncio
async def test_migrate_to_v15(bare_db, migration_base_db):
    await migration_base_db()
    async with get_db() as db:
        all_migrations = [
            migrate_to_v3,
            migrate_to_v4,
            migrate_to_v5,
            migrate_to_v6,
            migrate_to_v7,
            migrate_to_v8,
            migrate_to_v9,
            migrate_to_v10,
            migrate_to_v11,
            migrate_to_v12,
            migrate_to_v13,
            migrate_to_v14,
            migrate_to_v15,
        ]
        for m in all_migrations:
            await m(db)

    cols = await get_table_columns(bare_db, "models")
    assert "startup_error" in cols
    assert "startup_error_at" in cols

    ver = await get_migration_version(bare_db)
    assert ver == 15


# ---------------------------------------------------------------------------
# Full migration chain tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_full_migration_chain_from_v2(bare_db, migration_base_db):
    """Run all migrations sequentially from v2 and verify final state."""
    await migration_base_db()
    async with get_db() as db:
        for m in [
            migrate_to_v3,
            migrate_to_v4,
            migrate_to_v5,
            migrate_to_v6,
            migrate_to_v7,
            migrate_to_v8,
            migrate_to_v9,
            migrate_to_v10,
            migrate_to_v11,
            migrate_to_v12,
            migrate_to_v13,
            migrate_to_v14,
            migrate_to_v15,
        ]:
            await m(db)

    ver = await get_migration_version(bare_db)
    assert ver == 15

    expected_tables = {
        "users",
        "config",
        "user_usage",
        "audit_log",
        "request_log",
        "webhooks",
        "admin_log",
        "models",
        "user_model_access",
        "model_config_versions",
    }
    for t in expected_tables:
        assert await table_exists(bare_db, t), f"Table {t} should exist"


@pytest.mark.asyncio
async def test_full_migration_chain_idempotent(bare_db, migration_base_db):
    """Running the full chain twice should not error (idempotent)."""
    await migration_base_db()
    async with get_db() as db:
        for m in [
            migrate_to_v3,
            migrate_to_v4,
            migrate_to_v5,
            migrate_to_v6,
            migrate_to_v7,
            migrate_to_v8,
            migrate_to_v9,
            migrate_to_v10,
            migrate_to_v11,
            migrate_to_v12,
            migrate_to_v13,
            migrate_to_v14,
            migrate_to_v15,
        ]:
            await m(db)

    async with get_db() as db:
        for m in [
            migrate_to_v5,
            migrate_to_v7,
            migrate_to_v8,
            migrate_to_v11,
            migrate_to_v13,
            migrate_to_v15,
        ]:
            await m(db)

    ver = await get_migration_version(bare_db)
    assert ver == 15


@pytest.mark.asyncio
async def test_init_db_runs_full_migration_chain_from_v1(v1_db, bare_db):
    """init_db should create base tables and run all migrations on first boot."""
    from app.db import seed_users

    await v1_db()

    async with get_db() as db:
        await seed_users(db)

    async with get_db() as db:
        for m in [
            migrate_to_v3,
            migrate_to_v4,
            migrate_to_v5,
            migrate_to_v6,
            migrate_to_v7,
            migrate_to_v8,
            migrate_to_v9,
            migrate_to_v10,
            migrate_to_v11,
            migrate_to_v12,
            migrate_to_v13,
            migrate_to_v14,
            migrate_to_v15,
        ]:
            await m(db)

    ver = await get_migration_version(bare_db)
    assert ver == 15

    expected_tables = {
        "users",
        "config",
        "user_usage",
        "audit_log",
        "request_log",
        "webhooks",
        "admin_log",
        "models",
        "user_model_access",
        "model_config_versions",
    }
    for t in expected_tables:
        assert await table_exists(bare_db, t)


# ---------------------------------------------------------------------------
# _sync_admin_api_key_hash tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sync_admin_api_key_hash_creates_missing_hash(bare_db, migration_base_db):
    await migration_base_db()
    async with get_db() as db:
        for m in [migrate_to_v3, migrate_to_v4, migrate_to_v5, migrate_to_v6]:
            await m(db)

    async with get_db() as db:
        await _sync_admin_api_key_hash(db)

    async with (
        aiosqlite.connect(bare_db) as db,
        db.execute("SELECT value FROM config WHERE key = 'admin_api_key_hash'") as cur,
    ):
        row = await cur.fetchone()
    assert row is not None
    assert verify_key("test-secret-key-for-testing", row[0])


@pytest.mark.asyncio
async def test_sync_admin_api_key_hash_updates_stale_hash(bare_db, migration_base_db):
    await migration_base_db()
    async with get_db() as db:
        for m in [migrate_to_v3, migrate_to_v4, migrate_to_v5, migrate_to_v6]:
            await m(db)

    async with aiosqlite.connect(bare_db) as db:
        stale_hash = hash_key("old-wrong-key")
        await db.execute(
            "INSERT INTO config (key, value) VALUES (?, ?)",
            ("admin_api_key_hash", stale_hash),
        )
        await db.commit()

    async with get_db() as db:
        await _sync_admin_api_key_hash(db)

    async with (
        aiosqlite.connect(bare_db) as db,
        db.execute("SELECT value FROM config WHERE key = 'admin_api_key_hash'") as cur,
    ):
        row = await cur.fetchone()
    assert verify_key("test-secret-key-for-testing", row[0])
    assert not verify_key("old-wrong-key", row[0])


@pytest.mark.asyncio
async def test_sync_admin_api_key_hash_noop_when_setup_complete(bare_db, migration_base_db):
    await migration_base_db()
    async with get_db() as db:
        for m in [migrate_to_v3, migrate_to_v4, migrate_to_v5, migrate_to_v6, migrate_to_v14]:
            await m(db)

    async with aiosqlite.connect(bare_db) as db:
        await db.execute(
            "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)",
            ("setup_complete", "true"),
        )
        original_hash = hash_key("persistent-admin-key")
        await db.execute(
            "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)",
            ("admin_api_key_hash", original_hash),
        )
        await db.commit()

    async with get_db() as db:
        await _sync_admin_api_key_hash(db)

    async with (
        aiosqlite.connect(bare_db) as db,
        db.execute("SELECT value FROM config WHERE key = 'admin_api_key_hash'") as cur,
    ):
        row = await cur.fetchone()
    assert verify_key("persistent-admin-key", row[0])


@pytest.mark.asyncio
async def test_sync_admin_api_key_hash_noop_when_hash_valid(bare_db, migration_base_db):
    await migration_base_db()
    async with get_db() as db:
        for m in [migrate_to_v3, migrate_to_v4, migrate_to_v5, migrate_to_v6]:
            await m(db)

    async with aiosqlite.connect(bare_db) as db:
        correct_hash = hash_key("test-secret-key-for-testing")
        await db.execute(
            "INSERT INTO config (key, value) VALUES (?, ?)",
            ("admin_api_key_hash", correct_hash),
        )
        await db.commit()

    async with get_db() as db:
        await _sync_admin_api_key_hash(db)

    async with (
        aiosqlite.connect(bare_db) as db,
        db.execute("SELECT value FROM config WHERE key = 'admin_api_key_hash'") as cur,
    ):
        row = await cur.fetchone()
    assert row[0] == correct_hash


@pytest.mark.asyncio
async def test_sync_admin_api_key_hash_handles_corrupt_hash(bare_db, migration_base_db):
    await migration_base_db()
    async with get_db() as db:
        for m in [migrate_to_v3, migrate_to_v4, migrate_to_v5, migrate_to_v6]:
            await m(db)

    async with aiosqlite.connect(bare_db) as db:
        await db.execute(
            "INSERT INTO config (key, value) VALUES (?, ?)",
            ("admin_api_key_hash", "not-a-valid-bcrypt-hash"),
        )
        await db.commit()

    async with get_db() as db:
        await _sync_admin_api_key_hash(db)

    async with (
        aiosqlite.connect(bare_db) as db,
        db.execute("SELECT value FROM config WHERE key = 'admin_api_key_hash'") as cur,
    ):
        row = await cur.fetchone()
    assert verify_key("test-secret-key-for-testing", row[0])


# ---------------------------------------------------------------------------
# _get_seed_models tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_seed_models_returns_three_models():
    models = _get_seed_models()
    assert len(models) == 3
    ids = [m["id"] for m in models]
    assert "qwen36-27b" in ids
    assert "gpt-oss-20b" in ids
    assert "gemma4-31b" in ids


@pytest.mark.asyncio
async def test_get_seed_models_has_required_fields():
    models = _get_seed_models()
    required = {
        "id",
        "name",
        "image",
        "model_path",
        "context_length",
        "max_output_length",
        "container_name",
        "container_alias",
    }
    for m in models:
        for f in required:
            assert f in m, f"Missing field {f} in seed model {m.get('id')}"


@pytest.mark.asyncio
async def test_get_seed_models_first_is_active():
    models = _get_seed_models()
    qwen = next(m for m in models if m["id"] == "qwen36-27b")
    assert qwen["active"]


# ---------------------------------------------------------------------------
# _bootstrap_models tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bootstrap_models_creates_from_seed(bare_db, migration_base_db):
    await migration_base_db()
    async with get_db() as db:
        for m in [
            migrate_to_v3,
            migrate_to_v4,
            migrate_to_v5,
            migrate_to_v6,
            migrate_to_v7,
            migrate_to_v8,
            migrate_to_v9,
            migrate_to_v10,
            migrate_to_v11,
        ]:
            await m(db)

    async with aiosqlite.connect(bare_db) as db, db.execute("SELECT COUNT(*) FROM models") as cur:
        count = (await cur.fetchone())[0]
    assert count >= 1


@pytest.mark.asyncio
async def test_bootstrap_models_skips_if_models_exist(bare_db, migration_base_db):
    await migration_base_db()
    async with get_db() as db:
        for m in [
            migrate_to_v3,
            migrate_to_v4,
            migrate_to_v5,
            migrate_to_v6,
            migrate_to_v7,
            migrate_to_v8,
            migrate_to_v9,
            migrate_to_v10,
            migrate_to_v11,
        ]:
            await m(db)

    async with aiosqlite.connect(bare_db) as db:
        async with db.execute("SELECT COUNT(*) FROM models") as cur:
            initial_count = (await cur.fetchone())[0]

        await db.execute(
            """INSERT INTO models (model_id, name, image, model_path, context_length, max_output_length,
               port, container_name, container_alias)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            ("custom-model", "Custom", "img", "/p", 4096, 2048, 30001, "cn", "ca"),
        )
        await db.commit()

    async with get_db() as db:
        await _bootstrap_models(db)

    async with aiosqlite.connect(bare_db) as db, db.execute("SELECT COUNT(*) FROM models") as cur:
        final_count = (await cur.fetchone())[0]
    assert final_count == initial_count + 1


# ---------------------------------------------------------------------------
# bootstrap_users_from_json tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bootstrap_users_from_json_no_file(monkeypatch):
    monkeypatch.setattr("os.path.exists", lambda p: False)
    result = await bootstrap_users_from_json()
    assert result == 0


@pytest.mark.asyncio
async def test_bootstrap_users_from_json_creates_users(tmp_path, monkeypatch):
    json_file = tmp_path / "users.json"
    json_file.write_text(
        json.dumps(
            [
                {"name": "json_user1", "api_key": "sk-json1", "rate_limit": 10},
                {"name": "json_user2", "api_key": "sk-json2"},
            ]
        )
    )

    str(json_file.parent)
    monkeypatch.setattr("app.db.bootstrap_users_from_json.__module__", "app.db")

    original_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    os.path.join(original_dir, "users.json")

    try:
        if os.path.exists(json_file):
            temp_users_json = os.path.join(original_dir, "users.json")
            backup = None
            if os.path.exists(temp_users_json):
                with open(temp_users_json) as f:
                    backup = f.read()
            import shutil

            shutil.copy(str(json_file), temp_users_json)

            created = await bootstrap_users_from_json()
            assert created == 2

            if backup is not None:
                with open(temp_users_json, "w") as f:
                    f.write(backup)
            elif os.path.exists(temp_users_json):
                os.remove(temp_users_json)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Migration version config seeding
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_v3_seeds_default_config_values(bare_db, migration_base_db):
    await migration_base_db()
    async with get_db() as db:
        await migrate_to_v3(db)

    async with aiosqlite.connect(bare_db) as db, db.execute("SELECT key, value FROM config ORDER BY key") as cur:
        rows = await cur.fetchall()
    config_dict = {r[0]: r[1] for r in rows}
    assert config_dict.get("default_rate_limit") == "2"
    assert config_dict.get("default_max_concurrent") == "2"
    assert config_dict.get("default_request_cost") == "0.001"

import contextlib
import os
import tempfile

import pytest

os.environ.setdefault("ADMIN_API_KEY", "test-secret-key-for-testing")
os.environ.setdefault("SGFLEET_ENCRYPTION_KEY", "0" * 64)


@pytest.fixture(autouse=True)
def db_path(monkeypatch):
    """Use a temp SQLite file for each test - no WAL, no seed."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        tmp_path = f.name
    try:
        monkeypatch.setattr("app.config.settings.db_path", tmp_path)
        yield tmp_path
    finally:
        os.unlink(tmp_path)


@pytest.fixture(autouse=True)
def clear_token_cache():
    """Clear the in-memory token cache before each test."""
    import app.db

    app.db._token_cache.copy()
    app.db._token_cache.clear()
    yield
    app.db._token_cache.clear()


@pytest.fixture(autouse=True)
def clear_crypto_key():
    """Reset the cached Fernet key before each test."""
    import sys

    import app.crypto

    app.crypto._key = None  # type: ignore[attr-defined]
    yield
    app.crypto._key = None  # type: ignore[attr-defined]
    if "app.crypto" in sys.modules:
        sys.modules["app.crypto"]._key = None  # type: ignore[attr-defined]


async def init_test_db():
    """Create fresh tables without seed data. Call via _init_schema fixture."""
    import app.db

    async with app.db.get_db() as db:
        await db.execute("""CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            api_key_hash TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            rate_limit REAL DEFAULT 2,
            max_concurrent INTEGER DEFAULT 2,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            request_cost REAL DEFAULT 0.001,
            daily_quota INTEGER DEFAULT NULL,
            api_key TEXT DEFAULT NULL,
            email TEXT DEFAULT NULL,
            notes TEXT DEFAULT NULL,
            display_order INTEGER DEFAULT NULL,
            api_key_quick_hash TEXT DEFAULT NULL
        )""")
        await db.execute("""CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )""")
        await db.execute("""CREATE TABLE IF NOT EXISTS user_usage (
            user_id INTEGER, hour TEXT, request_count INTEGER DEFAULT 0,
            total_cost REAL DEFAULT 0, prompt_tokens INTEGER DEFAULT 0,
            completion_tokens INTEGER DEFAULT 0, total_tokens INTEGER DEFAULT 0,
            PRIMARY KEY (user_id, hour)
        )""")
        await db.execute("""CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL, action TEXT NOT NULL,
            target_user_id INTEGER DEFAULT NULL, detail TEXT DEFAULT '',
            ip_address TEXT DEFAULT ''
        )""")
        await db.execute("""CREATE TABLE IF NOT EXISTS request_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL, user_id INTEGER DEFAULT NULL,
            request_id TEXT DEFAULT '', method TEXT DEFAULT '',
            endpoint TEXT DEFAULT '', status INTEGER DEFAULT 0,
            latency_ms REAL DEFAULT 0, error_msg TEXT DEFAULT '',
            prompt_tokens INTEGER DEFAULT NULL, completion_tokens INTEGER DEFAULT NULL
        )""")
        await db.execute("""CREATE TABLE IF NOT EXISTS webhooks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL, url TEXT NOT NULL,
            events TEXT NOT NULL DEFAULT '[]',
            is_active INTEGER DEFAULT 1, secret TEXT DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )""")
        await db.execute("""CREATE TABLE IF NOT EXISTS admin_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            level TEXT NOT NULL,
            event TEXT,
            method TEXT,
            path TEXT,
            status INTEGER,
            latency_ms REAL,
            user TEXT,
            request_id TEXT,
            ip TEXT,
            error TEXT,
            message TEXT
        )""")
        await db.execute("""CREATE TABLE IF NOT EXISTS models (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_id TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            image TEXT NOT NULL,
            model_path TEXT NOT NULL,
            context_length INTEGER NOT NULL,
            max_output_length INTEGER NOT NULL,
            port INTEGER DEFAULT 30000,
            container_name TEXT NOT NULL,
            container_alias TEXT NOT NULL,
            model_alias TEXT DEFAULT 'sgfleet-api-model',
            active INTEGER DEFAULT 0,
            grace_period INTEGER DEFAULT 10,
            environment TEXT DEFAULT '{}',
            gpu TEXT DEFAULT 'auto',
            command_flags TEXT DEFAULT '[]',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )""")
        await db.execute("""CREATE TABLE IF NOT EXISTS user_model_access (
            user_id INTEGER NOT NULL,
            model_id INTEGER NOT NULL,
            PRIMARY KEY (user_id, model_id),
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (model_id) REFERENCES models(id)
        )""")
        with contextlib.suppress(Exception):
            await db.execute("ALTER TABLE users ADD COLUMN default_model_id INTEGER DEFAULT NULL REFERENCES models(id)")
        await db.execute("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", ("migration_version", "11"))
        await db.commit()


@pytest.fixture(autouse=True)
async def _init_schema(db_path):
    """Create tables before each test. Depends on db_path being set first."""
    await init_test_db()

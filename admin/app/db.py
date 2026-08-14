import contextlib
import hashlib
import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import UTC

import aiosqlite
import bcrypt as bcrypt_lib

from .config import generate_key, settings

logger = logging.getLogger("sgfleet-admin")
_MAX_VERSIONS = 10
_CONTAINER_RESTART_FIELDS = frozenset(
    {
        "image",
        "model_path",
        "port",
        "environment",
        "gpu",
        "command_flags",
        "context_length",
        "max_output_length",
    }
)


def _needs_restart(data: dict) -> bool:
    """Check if any container-affecting fields were changed."""
    return bool(data.keys() & _CONTAINER_RESTART_FIELDS)


def _normalize_command_flags(raw) -> list[str]:
    """Return a flat argv-style list of command flags.

    Historical bug: an earlier version of the model edit modal joined each
    flag and its value into a single token like ``"--context-length 170124"``
    before persisting. When Docker later forwarded these tokens verbatim to
    ``sglang serve``, argparse saw one argv element containing whitespace and
    rejected the option as an "unrecognized argument".

    This helper accepts either the legacy joined form or the correct flat
    argv form and always returns a flat argv list. Values that legitimately
    contain whitespace are preserved (we only split off the first token when
    it starts with ``--``).
    """
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    for tok in raw:
        if not isinstance(tok, str):
            continue
        s = tok.strip()
        if not s:
            continue
        if s.startswith("--") and (" " in s or "\t" in s):
            key, val = s.split(None, 1)
            out.append(key)
            val = val.strip()
            if val:
                out.append(val)
        else:
            out.append(s)
    return out


@asynccontextmanager
async def get_db():
    """Async context manager yielding an aiosqlite connection"""
    os.makedirs(os.path.dirname(settings.db_path) or ".", exist_ok=True)
    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = aiosqlite.Row
        await db.execute("PRAGMA journal_mode=WAL")
        yield db


async def init_db():
    """Create tables if not exist, seed config/users on first run."""
    import sqlite3
    from datetime import UTC, datetime

    from .config import settings as cfg

    def _log_startup(event: str, message: str):
        """Write startup event directly to admin_log for persistence."""
        try:
            conn = sqlite3.connect(cfg.db_path)
            try:
                conn.execute("PRAGMA journal_mode=WAL")
                # Table might not exist yet, so check first
                cur = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='admin_log'")
                if cur.fetchone():
                    conn.execute(
                        "INSERT INTO admin_log (timestamp, level, event, method, path, status, latency_ms, user, request_id, ip, error, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (
                            datetime.now(UTC).isoformat(),
                            "INFO",
                            event,
                            None,
                            None,
                            None,
                            None,
                            None,
                            None,
                            None,
                            None,
                            message,
                        ),
                    )
                    conn.commit()
            finally:
                conn.close()
        except Exception:
            pass

    _log_startup("startup", "starting")
    async with get_db() as db:
        await db.execute("""CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            api_key_hash TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            rate_limit REAL DEFAULT 2,
            max_concurrent INTEGER DEFAULT 2,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )""")
        await db.execute("""CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )""")
        await db.commit()

        # Seed sgfleet_base_url from env if not yet in DB
        env_base_url = os.environ.get("SGFLEET_BASE_URL", "")
        if env_base_url:
            async with db.execute("SELECT value FROM config WHERE key = ?", ("sgfleet_base_url",)) as cursor:
                row = await cursor.fetchone()
            if row is None:
                await db.execute(
                    "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", ("sgfleet_base_url", env_base_url)
                )
                await db.commit()

        async with db.execute("SELECT value FROM config WHERE key = ?", ("migration_version",)) as cursor:
            row = await cursor.fetchone()
        if row is None:
            await seed_users(db)
            current = 1
        else:
            try:
                current = int(row[0])
            except (TypeError, ValueError):
                current = 1

        # Run every pending migration in order. On a fresh install (current == 1)
        # this chains all the way from v3 upward so tables like ``user_usage``,
        # ``audit_log``, ``admin_log``, ``models`` etc. are created on first
        # startup instead of only appearing on the second boot.
        migrations = [
            (3, migrate_to_v3),
            (4, migrate_to_v4),
            (5, migrate_to_v5),
            (6, migrate_to_v6),
            (7, migrate_to_v7),
            (8, migrate_to_v8),
            (9, migrate_to_v9),
            (10, migrate_to_v10),
            (11, migrate_to_v11),
            (12, migrate_to_v12),
            (13, migrate_to_v13),
            (14, migrate_to_v14),
        ]
        for target, fn in migrations:
            if current < target:
                await fn(db)
                current = target

        # Self-heal: keep the stored admin key hash in sync with the env var.
        # Without this, if the ADMIN_API_KEY env var differs from the value
        # captured on first-run seed (e.g. after a volume rename, or if the
        # first boot used a stale .env), no admin key ever authenticates.
        await _sync_admin_api_key_hash(db)

        # Bootstrap users from users.json if they don't exist in the DB
        created = await bootstrap_users_from_json()
        if created:
            _log_startup("bootstrap", f"created {created} user(s) from users.json")

        # Log final migration version
        async with db.execute("SELECT value FROM config WHERE key = ?", ("migration_version",)) as cursor:
            ver_row = await cursor.fetchone()
            ver = ver_row[0] if ver_row else "unknown"
        _log_startup("migration", f"schema_version={ver}")


async def migrate_to_v3(db):
    """Migrate from v1 schema to v3: add request_cost, daily_quota, user_usage table."""
    await db.execute(
        """CREATE TABLE users_new (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, api_key_hash TEXT NOT NULL, is_active INTEGER DEFAULT 1, rate_limit REAL DEFAULT 2, max_concurrent INTEGER DEFAULT 2, request_cost REAL DEFAULT 0.001, daily_quota INTEGER DEFAULT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"""
    )
    await db.execute(
        """INSERT INTO users_new (id, name, api_key_hash, is_active, rate_limit, max_concurrent, created_at) SELECT id, name, api_key_hash, is_active, rate_limit, max_concurrent, created_at FROM users"""
    )
    await db.execute("""DROP TABLE users""")
    await db.execute("""ALTER TABLE users_new RENAME TO users""")
    await db.execute(
        """CREATE TABLE user_usage (user_id INTEGER, hour TEXT, request_count INTEGER DEFAULT 0, total_cost REAL DEFAULT 0, PRIMARY KEY (user_id, hour))"""
    )
    await db.execute("""INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)""", ("default_rate_limit", "2"))
    await db.execute("""INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)""", ("default_max_concurrent", "2"))
    await db.execute("""INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)""", ("default_request_cost", "0.001"))
    await db.execute("""UPDATE config SET value = ? WHERE key = ?""", ("3", "migration_version"))
    await db.commit()


async def migrate_to_v4(db):
    """Add api_key column to store plaintext API key for config generation."""
    await db.execute("ALTER TABLE users ADD COLUMN api_key TEXT DEFAULT NULL")
    await db.execute("UPDATE config SET value = ? WHERE key = ?", ("4", "migration_version"))
    await db.commit()


async def migrate_to_v5(db):
    """Add email, notes, display_order columns to users table."""
    for col, dtype in [
        ("email", "TEXT DEFAULT NULL"),
        ("notes", "TEXT DEFAULT NULL"),
        ("display_order", "INTEGER DEFAULT NULL"),
    ]:
        with contextlib.suppress(Exception):
            await db.execute(f"ALTER TABLE users ADD COLUMN {col} {dtype}")
    await db.execute("UPDATE config SET value = ? WHERE key = ?", ("5", "migration_version"))


async def migrate_to_v6(db):
    """Add audit_log and request_log tables."""
    await db.execute("""CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        action TEXT NOT NULL,
        target_user_id INTEGER DEFAULT NULL,
        detail TEXT DEFAULT '',
        ip_address TEXT DEFAULT ''
    )""")
    await db.execute("""CREATE TABLE IF NOT EXISTS request_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        user_id INTEGER DEFAULT NULL,
        request_id TEXT DEFAULT '',
        method TEXT DEFAULT '',
        endpoint TEXT DEFAULT '',
        status INTEGER DEFAULT 0,
        latency_ms REAL DEFAULT 0,
        error_msg TEXT DEFAULT ''
    )""")
    await db.execute("UPDATE config SET value = ? WHERE key = ?", ("6", "migration_version"))
    await db.commit()


async def migrate_to_v7(db):
    """Add api_key_quick_hash column (SHA256) for O(1) token lookup + index."""
    with contextlib.suppress(Exception):
        await db.execute("ALTER TABLE users ADD COLUMN api_key_quick_hash TEXT DEFAULT NULL")
    with contextlib.suppress(Exception):
        await db.execute("CREATE INDEX idx_users_quick_hash ON users(api_key_quick_hash)")
    async with db.execute('SELECT id, api_key FROM users WHERE api_key IS NOT NULL AND api_key != ""') as cursor:
        rows = await cursor.fetchall()
    for r in rows:
        uid, raw_key = r[0], r[1]
        quick_hash = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
        await db.execute("UPDATE users SET api_key_quick_hash = ? WHERE id = ?", (quick_hash, uid))
    await db.execute("UPDATE config SET value = ? WHERE key = ?", ("7", "migration_version"))
    await db.commit()


async def migrate_to_v8(db):
    """Add token columns to user_usage and request_log tables."""
    with contextlib.suppress(Exception):
        await db.execute("ALTER TABLE user_usage ADD COLUMN prompt_tokens INTEGER DEFAULT 0")
    with contextlib.suppress(Exception):
        await db.execute("ALTER TABLE user_usage ADD COLUMN completion_tokens INTEGER DEFAULT 0")
    with contextlib.suppress(Exception):
        await db.execute("ALTER TABLE user_usage ADD COLUMN total_tokens INTEGER DEFAULT 0")
    with contextlib.suppress(Exception):
        await db.execute("ALTER TABLE request_log ADD COLUMN prompt_tokens INTEGER DEFAULT NULL")
    with contextlib.suppress(Exception):
        await db.execute("ALTER TABLE request_log ADD COLUMN completion_tokens INTEGER DEFAULT NULL")
    await db.execute("UPDATE config SET value = ? WHERE key = ?", ("8", "migration_version"))
    await db.commit()


async def migrate_to_v9(db):
    """Add webhooks table for notifications."""
    await db.execute("""CREATE TABLE IF NOT EXISTS webhooks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        events TEXT NOT NULL DEFAULT '[]',
        is_active INTEGER DEFAULT 1,
        secret TEXT DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )""")
    await db.execute("UPDATE config SET value = ? WHERE key = ?", ("9", "migration_version"))
    await db.commit()


async def migrate_to_v10(db):
    """Add admin_log table for persistent log storage."""
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
    await db.execute("UPDATE config SET value = ? WHERE key = ?", ("10", "migration_version"))
    await db.commit()


async def seed_users(db):
    """Seed migration version on first run.

    Admin key hash is no longer seeded here — it is set by the setup wizard
    via `set_admin_credentials`. The `_sync_admin_api_key_hash` call in
    `init_db` handles legacy deployments that still use ADMIN_API_KEY env var.
    """
    await db.execute("INSERT INTO config (key, value) VALUES (?, ?)", ("migration_version", "1"))
    await db.commit()


async def bootstrap_users_from_json():
    """Read users.json and create any users that don't already exist in the DB."""
    # __file__ is admin/app/db.py → repo root is 3 levels up
    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    json_path = os.path.join(repo_root, "users.json")
    if not os.path.exists(json_path):
        return 0

    with open(json_path, encoding="utf-8") as f:
        users_data = json.load(f)

    if not isinstance(users_data, list):
        users_data = [users_data]

    created = 0
    for item in users_data:
        name = item.get("name")
        if not name:
            continue

        existing = await get_user_by_name(name)
        if existing:
            continue

        raw_key = item.get("api_key") or generate_key()
        await create_user(
            name=name,
            raw_key=raw_key,
            rate_limit=item.get("rate_limit", 2),
            max_concurrent=item.get("max_concurrent", 2),
            request_cost=item.get("request_cost", 0.001),
            daily_quota=item.get("daily_quota"),
            email=item.get("email"),
            notes=item.get("notes"),
        )
        created += 1

    return created


async def _sync_admin_api_key_hash(db):
    """Ensure ``admin_api_key_hash`` in ``config`` verifies against the env var.

    Only runs when setup wizard has NOT been completed (legacy mode).
    After setup, the admin key is managed via encrypted DB storage and this
    function is a no-op to prevent overwriting the stored hash with bcrypt("").
    """
    from .config import settings as cfg

    async with db.execute("SELECT value FROM config WHERE key = ?", ("setup_complete",)) as cursor:
        row = await cursor.fetchone()
    if row and row[0] == "true":
        return

    async with db.execute("SELECT value FROM config WHERE key = ?", ("admin_api_key_hash",)) as cursor:
        row = await cursor.fetchone()

    needs_update = False
    if row is None:
        needs_update = True
    else:
        try:
            if not verify_key(cfg.admin_api_key, row[0]):
                needs_update = True
        except Exception:
            needs_update = True

    if needs_update:
        new_hash = bcrypt_lib.hashpw(cfg.admin_api_key.encode("utf-8"), bcrypt_lib.gensalt()).decode("utf-8")
        await db.execute(
            "INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            ("admin_api_key_hash", new_hash),
        )
        await db.commit()


async def migrate_to_v11(db):
    """Add models table, user_model_access table, and default_model_id to users."""
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
    await _bootstrap_models(db)
    await db.execute("UPDATE config SET value = ? WHERE key = ?", ("11", "migration_version"))
    await db.commit()


async def migrate_to_v12(db):
    """Rename sglang-* branding to sgfleet-*: container names, aliases, model alias."""
    await db.execute(
        "UPDATE models SET container_name = 'sgfleet-qwen36-27b' WHERE container_name = 'sglang-qwen36-27b'"
    )
    await db.execute(
        "UPDATE models SET container_alias = 'sgfleet-qwen36-27b' WHERE container_alias = 'sglang-qwen36-27b'"
    )
    await db.execute(
        "UPDATE models SET container_name = 'sgfleet-gpt-oss-20b' WHERE container_name = 'sglang-gpt-oss-20b'"
    )
    await db.execute(
        "UPDATE models SET container_alias = 'sgfleet-gpt-oss-20b' WHERE container_alias = 'sglang-gpt-oss-20b'"
    )
    await db.execute(
        "UPDATE models SET container_name = 'sgfleet-gemma4-31b' WHERE container_name = 'sglang-gemma4-31b'"
    )
    await db.execute(
        "UPDATE models SET container_alias = 'sgfleet-gemma4-31b' WHERE container_alias = 'sglang-gemma4-31b'"
    )
    await db.execute("UPDATE models SET model_alias = 'sgfleet-api-model' WHERE model_alias = 'sglang-api-model'")
    await db.execute("UPDATE config SET value = ? WHERE key = ?", ("12", "migration_version"))
    await db.commit()


async def migrate_to_v13(db):
    """Add model_config_versions table and pending_restart column to models."""
    await db.execute("""CREATE TABLE IF NOT EXISTS model_config_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        snapshot TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (model_id) REFERENCES models(model_id)
    )""")
    with contextlib.suppress(Exception):
        await db.execute("ALTER TABLE models ADD COLUMN pending_restart INTEGER DEFAULT 0")
    await db.execute("UPDATE config SET value = ? WHERE key = ?", ("13", "migration_version"))
    await db.commit()


async def migrate_to_v14(db):
    """Add setup_complete flag. No schema changes — uses existing config table."""
    async with db.execute("SELECT key FROM config WHERE key IN ('admin_api_key', 'admin_api_key_hash', 'admin_api_key_enc')") as cursor:
        row = await cursor.fetchone()
    if row:
        await db.execute("INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)", ("setup_complete", "true"))
    await db.execute("UPDATE config SET value = ? WHERE key = ?", ("14", "migration_version"))
    await db.commit()


def _get_seed_models() -> list[dict]:
    """Fallback seed models when models.json is not available."""
    return [
        {
            "id": "qwen36-27b",
            "name": "Qwen 3.6 27B (FP8)",
            "image": "lmsysorg/sglang:v0.5.16",
            "model_path": "/models/Qwen3.6-27B-FP8",
            "context_length": 196608,
            "max_output_length": 8192,
            "port": 30000,
            "container_name": "sgfleet-qwen36-27b",
            "container_alias": "sgfleet-qwen36-27b",
            "model_alias": "sgfleet-api-model",
            "active": 1,
            "grace_period": 10,
            "environment": json.dumps(
                {
                    "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True",
                    "SGLANG_ALLOW_OVERWRITE_LONGER_CONTEXT_LEN": "1",
                    "SGLANG_MAMBA_CONV_DTYPE": "bfloat16",
                    "SGLANG_MAMBA_SSM_DTYPE": "bfloat16",
                    "SGLANG_USE_BREAKABLE_CUDA_GRAPH": "true",
                }
            ),
            "gpu": "auto",
            "command_flags": json.dumps(
                [
                    "--context-length",
                    "170124",
                    "--kv-cache-dtype",
                    "fp8_e4m3",
                    "--mem-fraction-static",
                    "0.82",
                    "--chunked-prefill-size",
                    "8192",
                    "--enable-metrics",
                    "--enable-flashinfer",
                    "--flashinfer-allreduce-fusion-backend",
                    "auto",
                    "--reasoning-parser",
                    "qwen3",
                    "--tool-call-parser",
                    "qwen3_coder",
                    "--json-model-override-args",
                    '{"rope_scaling":{"rope_type":"yarn","factor":3.0,"original_max_position_embeddings":65536,"rope_theta":10000000.0}}',
                    "--speculative-algorithm",
                    "NGRAM",
                    "--speculative-num-steps",
                    "4",
                ]
            ),
        },
        {
            "id": "gpt-oss-20b",
            "name": "gpt-oss 20b (FP4)",
            "image": "lmsysorg/sglang:v0.5.16",
            "model_path": "/models/gpt-oss-20b",
            "context_length": 131072,
            "max_output_length": 8192,
            "port": 30000,
            "container_name": "sgfleet-gpt-oss-20b",
            "container_alias": "sgfleet-gpt-oss-20b",
            "model_alias": "sgfleet-api-model",
            "active": 0,
            "grace_period": 10,
            "environment": json.dumps(
                {
                    "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True",
                    "SGLANG_ALLOW_OVERWRITE_LONGER_CONTEXT_LEN": "1",
                    "SGLANG_USE_BREAKABLE_CUDA_GRAPH": "true",
                }
            ),
            "gpu": "auto",
            "command_flags": json.dumps(
                [
                    "--context-length",
                    "131072",
                    "--kv-cache-dtype",
                    "fp4_mx_block16",
                    "--mem-fraction-static",
                    "0.90",
                    "--chunked-prefill-size",
                    "8192",
                    "--enable-metrics",
                    "--enable-flashinfer",
                ]
            ),
        },
        {
            "id": "gemma4-31b",
            "name": "Gemma 4 31B (FP8)",
            "image": "lmsysorg/sglang:v0.5.16",
            "model_path": "/models/gemma-4-31B",
            "context_length": 262144,
            "max_output_length": 8192,
            "port": 30000,
            "container_name": "sgfleet-gemma4-31b",
            "container_alias": "sgfleet-gemma4-31b",
            "model_alias": "sgfleet-api-model",
            "active": 0,
            "grace_period": 10,
            "environment": json.dumps(
                {
                    "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True",
                    "SGLANG_ALLOW_OVERWRITE_LONGER_CONTEXT_LEN": "1",
                    "SGLANG_USE_BREAKABLE_CUDA_GRAPH": "true",
                }
            ),
            "gpu": "auto",
            "command_flags": json.dumps(
                [
                    "--context-length",
                    "262144",
                    "--kv-cache-dtype",
                    "fp8_e4m3",
                    "--mem-fraction-static",
                    "0.90",
                    "--chunked-prefill-size",
                    "8192",
                    "--enable-metrics",
                    "--enable-flashinfer",
                    "--reasoning-parser",
                    "gemma4",
                    "--tool-call-parser",
                    "gemma4",
                ]
            ),
        },
    ]


async def _bootstrap_models(db):
    """Bootstrap models from models.json or seed defaults if table is empty."""
    # Check if models table already has data
    async with db.execute("SELECT COUNT(*) FROM models") as cursor:
        row = await cursor.fetchone()
        if row and row[0] > 0:
            return

    # Try loading from models.json
    models_data = None
    json_paths = [
        "/opt/compose/models.json",
        os.path.join(os.path.dirname(__file__), "..", "..", "models.json"),
    ]
    for json_path in json_paths:
        if os.path.exists(json_path):
            try:
                with open(json_path) as f:
                    raw = json.load(f)
                models_data = raw.get("models", raw if isinstance(raw, list) else [])
                break
            except (json.JSONDecodeError, OSError):
                continue

    if not models_data:
        models_data = _get_seed_models()

    for m in models_data:
        await db.execute(
            """INSERT OR IGNORE INTO models
               (model_id, name, image, model_path, context_length, max_output_length,
                port, container_name, container_alias, model_alias, active, grace_period,
                environment, gpu, command_flags)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                m["id"],
                m["name"],
                m["image"],
                m["model_path"],
                m["context_length"],
                m["max_output_length"],
                m.get("port", 30000),
                m["container_name"],
                m["container_alias"],
                m.get("model_alias", "sgfleet-api-model"),
                1 if m.get("active") else 0,
                m.get("grace_period", 10),
                json.dumps(m.get("environment", {})),
                m.get("gpu", "auto"),
                json.dumps(_normalize_command_flags(m.get("command_flags", []))),
            ),
        )
    await db.commit()


async def get_all_models() -> list[dict]:
    """Get all models from the database."""
    async with get_db() as db, db.execute("SELECT * FROM models ORDER BY id") as cursor:
        rows = await cursor.fetchall()
    result = []
    for r in rows:
        d = dict(r)
        d["active"] = bool(d["active"])
        d["pending_restart"] = bool(d.get("pending_restart", 0))
        d["environment"] = json.loads(d.get("environment", "{}"))
        d["command_flags"] = _normalize_command_flags(json.loads(d.get("command_flags", "[]")))
        result.append(d)
    return result


async def get_model_by_id(model_id: str) -> dict | None:
    """Get a model by its model_id string."""
    async with get_db() as db, db.execute("SELECT * FROM models WHERE model_id = ?", (model_id,)) as cursor:
        row = await cursor.fetchone()
        if not row:
            return None
        d = dict(row)
        d["active"] = bool(d["active"])
        d["pending_restart"] = bool(d.get("pending_restart", 0))
        d["environment"] = json.loads(d.get("environment", "{}"))
        d["command_flags"] = _normalize_command_flags(json.loads(d.get("command_flags", "[]")))
        return d


async def get_active_models() -> list[dict]:
    """Get all active models."""
    async with get_db() as db, db.execute("SELECT * FROM models WHERE active = 1 ORDER BY id") as cursor:
        rows = await cursor.fetchall()
    result = []
    for r in rows:
        d = dict(r)
        d["active"] = True
        d["pending_restart"] = bool(d.get("pending_restart", 0))
        d["environment"] = json.loads(d.get("environment", "{}"))
        d["command_flags"] = _normalize_command_flags(json.loads(d.get("command_flags", "[]")))
        result.append(d)
    return result


async def create_model(data: dict) -> dict:
    """Create a new model entry."""
    env_json = json.dumps(data.get("environment", {}))
    flags_json = json.dumps(_normalize_command_flags(data.get("command_flags", [])))
    async with get_db() as db:
        await db.execute(
            """INSERT INTO models (model_id, name, image, model_path, context_length, max_output_length,
                                   port, container_name, container_alias, model_alias, active, grace_period,
                                   environment, gpu, command_flags)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                data["model_id"],
                data["name"],
                data["image"],
                data["model_path"],
                data["context_length"],
                data["max_output_length"],
                data.get("port", 30000),
                data["container_name"],
                data["container_alias"],
                data.get("model_alias", "sgfleet-api-model"),
                1 if data.get("active") else 0,
                data.get("grace_period", 10),
                env_json,
                data.get("gpu", "auto"),
                flags_json,
            ),
        )
        await db.commit()
    model = await get_model_by_id(data["model_id"])
    if model:
        await _save_version_inline(data["model_id"], model)
    return model  # type: ignore[return-value]


async def _save_version_inline(model_id: str, model: dict):
    """Save a version snapshot (opens its own DB connection)."""
    async with get_db() as db:
        await _save_version(db, model_id, _model_to_snapshot(model))
        await db.commit()


async def update_model(model_id: str, data: dict):
    """Update a model entry. Only updates provided fields."""
    async with get_db() as db:
        if "name" in data:
            await db.execute("UPDATE models SET name = ? WHERE model_id = ?", (data["name"], model_id))
        if "image" in data:
            await db.execute("UPDATE models SET image = ? WHERE model_id = ?", (data["image"], model_id))
        if "model_path" in data:
            await db.execute("UPDATE models SET model_path = ? WHERE model_id = ?", (data["model_path"], model_id))
        if "context_length" in data:
            await db.execute(
                "UPDATE models SET context_length = ? WHERE model_id = ?", (data["context_length"], model_id)
            )
        if "max_output_length" in data:
            await db.execute(
                "UPDATE models SET max_output_length = ? WHERE model_id = ?", (data["max_output_length"], model_id)
            )
        if "port" in data:
            await db.execute("UPDATE models SET port = ? WHERE model_id = ?", (data["port"], model_id))
        if "container_name" in data:
            await db.execute(
                "UPDATE models SET container_name = ? WHERE model_id = ?", (data["container_name"], model_id)
            )
        if "container_alias" in data:
            await db.execute(
                "UPDATE models SET container_alias = ? WHERE model_id = ?", (data["container_alias"], model_id)
            )
        if "model_alias" in data:
            await db.execute("UPDATE models SET model_alias = ? WHERE model_id = ?", (data["model_alias"], model_id))
        if "active" in data:
            await db.execute("UPDATE models SET active = ? WHERE model_id = ?", (1 if data["active"] else 0, model_id))
        if "grace_period" in data:
            await db.execute("UPDATE models SET grace_period = ? WHERE model_id = ?", (data["grace_period"], model_id))
        if "environment" in data:
            await db.execute(
                "UPDATE models SET environment = ? WHERE model_id = ?", (json.dumps(data["environment"]), model_id)
            )
        if "gpu" in data:
            await db.execute("UPDATE models SET gpu = ? WHERE model_id = ?", (data["gpu"], model_id))
        if "command_flags" in data:
            await db.execute(
                "UPDATE models SET command_flags = ? WHERE model_id = ?",
                (json.dumps(_normalize_command_flags(data["command_flags"])), model_id),
            )
        await db.commit()
    model = await get_model_by_id(model_id)
    if model:
        await _save_version_inline(model_id, model)
        if _needs_restart(data):
            await set_pending_restart(model_id, True)


async def delete_model(model_id: str):
    """Delete a model entry and its user access assignments."""
    async with get_db() as db:
        await db.execute(
            "DELETE FROM user_model_access WHERE model_id = (SELECT id FROM models WHERE model_id = ?)", (model_id,)
        )
        await db.execute(
            "UPDATE users SET default_model_id = NULL WHERE default_model_id = (SELECT id FROM models WHERE model_id = ?)",
            (model_id,),
        )
        await db.execute("DELETE FROM model_config_versions WHERE model_id = ?", (model_id,))
        await db.execute("DELETE FROM models WHERE model_id = ?", (model_id,))
        await db.commit()


async def get_user_model_access(user_id: int) -> list[dict]:
    """Get models assigned to a user."""
    async with (
        get_db() as db,
        db.execute(
            """SELECT m.* FROM models m
           JOIN user_model_access uma ON m.id = uma.model_id
           WHERE uma.user_id = ?""",
            (user_id,),
        ) as cursor,
    ):
        rows = await cursor.fetchall()
    result = []
    for r in rows:
        d = dict(r)
        d["active"] = bool(d["active"])
        d["pending_restart"] = bool(d.get("pending_restart", 0))
        d["environment"] = json.loads(d.get("environment", "{}"))
        d["command_flags"] = _normalize_command_flags(json.loads(d.get("command_flags", "[]")))
        result.append(d)
    return result


async def set_user_model_access(user_id: int, model_ids: list[str]):
    """Set model access for a user. Replaces existing assignments."""
    async with get_db() as db:
        await db.execute("DELETE FROM user_model_access WHERE user_id = ?", (user_id,))
        for mid in model_ids:
            async with db.execute("SELECT id FROM models WHERE model_id = ?", (mid,)) as cursor:
                row = await cursor.fetchone()
                if row:
                    await db.execute(
                        "INSERT OR IGNORE INTO user_model_access (user_id, model_id) VALUES (?, ?)", (user_id, row[0])
                    )
        await db.commit()


async def bootstrap_models_from_json(json_path: str) -> int:
    """Bootstrap models from a JSON file. Returns count of models imported."""
    if not os.path.exists(json_path):
        raise FileNotFoundError(f"models.json not found at {json_path}")
    with open(json_path) as f:
        raw = json.load(f)
    models_data = raw.get("models", raw if isinstance(raw, list) else [])
    count = 0
    changed_ids = []
    async with get_db() as db:
        for m in models_data:
            mid = m["id"]
            await db.execute(
                """INSERT OR REPLACE INTO models
                    (model_id, name, image, model_path, context_length, max_output_length,
                     port, container_name, container_alias, model_alias, active, grace_period,
                     environment, gpu, command_flags)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    mid,
                    m["name"],
                    m["image"],
                    m["model_path"],
                    m["context_length"],
                    m["max_output_length"],
                    m.get("port", 30000),
                    m["container_name"],
                    m["container_alias"],
                    m.get("model_alias", "sgfleet-api-model"),
                    1 if m.get("active") else 0,
                    m.get("grace_period", 10),
                    json.dumps(m.get("environment", {})),
                    m.get("gpu", "auto"),
                    json.dumps(_normalize_command_flags(m.get("command_flags", []))),
                ),
            )
            changed_ids.append(mid)
            count += 1
        await db.commit()
    for mid in changed_ids:
        model = await get_model_by_id(mid)
        if model:
            await _save_version_inline(mid, model)
    return count


async def export_models_to_dict() -> list[dict]:
    """Export all models as a JSON-serializable list."""
    models = await get_all_models()
    result = []
    for m in models:
        result.append(
            {
                "id": m["model_id"],
                "name": m["name"],
                "image": m["image"],
                "model_path": m["model_path"],
                "context_length": m["context_length"],
                "max_output_length": m["max_output_length"],
                "port": m["port"],
                "container_name": m["container_name"],
                "container_alias": m["container_alias"],
                "model_alias": m["model_alias"],
                "active": m["active"],
                "grace_period": m["grace_period"],
                "environment": m["environment"],
                "gpu": m["gpu"],
                "command_flags": m["command_flags"],
            }
        )
    return result


def _model_to_snapshot(m: dict) -> dict:
    """Convert a model dict to a version snapshot (serializable)."""
    return {
        "model_id": m["model_id"],
        "name": m["name"],
        "image": m["image"],
        "model_path": m["model_path"],
        "context_length": m["context_length"],
        "max_output_length": m["max_output_length"],
        "port": m["port"],
        "container_name": m["container_name"],
        "container_alias": m["container_alias"],
        "model_alias": m["model_alias"],
        "active": m["active"],
        "grace_period": m["grace_period"],
        "environment": m["environment"],
        "gpu": m["gpu"],
        "command_flags": m["command_flags"],
    }


async def _save_version(db, model_id: str, snapshot: dict) -> int:
    """Save a version snapshot and prune old versions. Returns new version number."""
    async with db.execute(
        "SELECT COALESCE(MAX(version), 0) + 1 FROM model_config_versions WHERE model_id = ?",
        (model_id,),
    ) as cursor:
        row = await cursor.fetchone()
        version = row[0]
    await db.execute(
        "INSERT INTO model_config_versions (model_id, version, snapshot) VALUES (?, ?, ?)",
        (model_id, version, json.dumps(snapshot)),
    )
    await db.execute(
        "DELETE FROM model_config_versions WHERE model_id = ? AND version < (SELECT MAX(version) - ? FROM model_config_versions WHERE model_id = ?)",
        (model_id, _MAX_VERSIONS - 1, model_id),
    )
    logger.info("Saved model config version %d for %s", version, model_id)
    return version


async def save_model_version(model_id: str, snapshot: dict) -> int:
    """Save a model config version (public API, opens its own DB connection)."""
    async with get_db() as db:
        return await _save_version(db, model_id, snapshot)


async def get_model_versions(model_id: str) -> list[dict]:
    """Get all versions for a model, ordered by version desc."""
    async with (
        get_db() as db,
        db.execute(
            "SELECT version, snapshot, created_at FROM model_config_versions WHERE model_id = ? ORDER BY version DESC",
            (model_id,),
        ) as cursor,
    ):
        rows = await cursor.fetchall()
    result = []
    for r in rows:
        result.append(
            {
                "version": r[0],
                "snapshot": json.loads(r[1]),
                "created_at": r[2],
            }
        )
    return result


async def get_model_versions_for_field(model_id: str, field: str) -> list[dict]:
    """Get distinct historical values for a specific field, for per-field revert dropdowns."""
    versions = await get_model_versions(model_id)
    seen = set()
    result = []
    for v in versions:
        val = v["snapshot"].get(field)
        val_key = (
            json.dumps(val, sort_keys=True)
            if not isinstance(val, (str, int, bool, type(None)))
            else str(val)
            if val is not None
            else "__null__"
        )
        if val_key not in seen:
            seen.add(val_key)
            result.append({"version": v["version"], "value": val, "created_at": v["created_at"]})
    return result


async def set_pending_restart(model_id: str, pending: bool):
    """Set or clear the pending_restart flag for a model."""
    async with get_db() as db:
        await db.execute("UPDATE models SET pending_restart = ? WHERE model_id = ?", (1 if pending else 0, model_id))
        await db.commit()


async def set_user_default_model(user_id: int, model_id: str | None):
    """Set a user's default model."""
    if model_id is None:
        async with get_db() as db:
            await db.execute("UPDATE users SET default_model_id = NULL WHERE id = ?", (user_id,))
            await db.commit()
        return
    async with get_db() as db, db.execute("SELECT id FROM models WHERE model_id = ?", (model_id,)) as cursor:
        row = await cursor.fetchone()
        if row:
            await db.execute("UPDATE users SET default_model_id = ? WHERE id = ?", (row[0], user_id))
            await db.commit()
        else:
            raise ValueError(f"Model {model_id} not found")


async def get_user_default_model(user_id: int) -> dict | None:
    """Get a user's default model."""
    async with (
        get_db() as db,
        db.execute(
            "SELECT m.* FROM models m JOIN users u ON u.default_model_id = m.id WHERE u.id = ?",
            (user_id,),
        ) as cursor,
    ):
        row = await cursor.fetchone()
        if not row:
            return None
        d = dict(row)
        d["active"] = bool(d["active"])
        d["pending_restart"] = bool(d.get("pending_restart", 0))
        d["environment"] = json.loads(d.get("environment", "{}"))
        d["command_flags"] = _normalize_command_flags(json.loads(d.get("command_flags", "[]")))
        return d


def hash_key(raw_key: str) -> str:
    return bcrypt_lib.hashpw(raw_key.encode("utf-8"), bcrypt_lib.gensalt()).decode("utf-8")


def quick_hash_key(raw_key: str) -> str:
    """SHA256 of raw key for O(1) lookup."""
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def verify_key(raw_key: str, stored_hash: str) -> bool:
    return bcrypt_lib.checkpw(raw_key.encode("utf-8"), stored_hash.encode("utf-8"))


async def get_user_by_token(token: str) -> dict | None:
    """Look up a user by their API token. Returns dict or None.
    Uses SHA256 quick hash for O(1) single-row lookup, then bcrypt-verifies."""
    import time

    now = time.monotonic()
    if token in _token_cache:
        ts, user = _token_cache[token]
        if now - ts < _TOKEN_TTL:
            return user
        _token_cache.pop(token, None)
    result = await _get_user_by_token_unsafe(token)
    if result is not None:
        _token_cache[token] = (now, result)
    if len(_token_cache) > 1000:
        _token_cache.clear()
    return result


_token_cache: dict[str, tuple[float, dict]] = {}
_TOKEN_TTL = 60  # seconds


async def _get_user_by_token_unsafe(token: str) -> dict | None:
    """Fast + fallback token lookup. SHA256 index → O(1), bcrypt verify candidate."""
    quick = hashlib.sha256(token.encode("utf-8")).hexdigest()
    async with get_db() as db:
        async with db.execute("SELECT * FROM users WHERE api_key_quick_hash = ? AND is_active = 1", (quick,)) as cursor:
            candidate = await cursor.fetchone()
        if candidate and verify_key(token, dict(candidate)["api_key_hash"]):
            return dict(
                id=candidate["id"],
                name=candidate["name"],
                api_key_hash=candidate["api_key_hash"],
                is_active=bool(candidate["is_active"]),
                rate_limit=candidate["rate_limit"],
                max_concurrent=candidate["max_concurrent"],
                request_cost=candidate["request_cost"],
                daily_quota=candidate["daily_quota"],
                created_at=candidate["created_at"],
            )

    # Fallback: full scan for safety (handles legacy/migrated users without quick hash)
    async with get_db() as db, db.execute("SELECT * FROM users WHERE is_active = 1") as cursor:
        users = await cursor.fetchall()
    for u in users:
        ud = dict(u)
        if ud.get("api_key_quick_hash") is not None:
            continue  # Already covered by fast path, skip to avoid double bcrypt
        if verify_key(token, ud["api_key_hash"]):
            return dict(
                id=ud["id"],
                name=ud["name"],
                api_key_hash=ud["api_key_hash"],
                is_active=bool(ud["is_active"]),
                rate_limit=ud["rate_limit"],
                max_concurrent=ud["max_concurrent"],
                request_cost=ud["request_cost"],
                daily_quota=ud["daily_quota"],
                created_at=ud["created_at"],
            )
    return None


async def get_all_users() -> list:
    from datetime import datetime

    today = datetime.now(UTC).strftime("%Y-%m-%d 00:00")
    query = """
        SELECT u.id, u.name, u.is_active, u.rate_limit, u.max_concurrent,
               u.request_cost, u.daily_quota, u.created_at, u.api_key_hash, u.api_key,
               u.email, u.notes,
               COALESCE(SUM(
                    CASE WHEN uu.hour >= ? THEN uu.request_count ELSE 0 END
                ), 0) as today_requests,
                COALESCE((SELECT SUM(request_count) FROM user_usage WHERE user_id = u.id), 0) as total_requests
        FROM users u
        LEFT JOIN user_usage uu ON u.id = uu.user_id
        GROUP BY u.id
        ORDER BY COALESCE(u.display_order, 0) DESC, u.created_at DESC
    """
    async with get_db() as db, db.execute(query, (today,)) as cursor:
        return [
            dict(
                id=r[0],
                name=r[1],
                api_key_hash=r[8],
                api_key=r[9],
                is_active=bool(r[2]),
                rate_limit=r[3],
                max_concurrent=r[4],
                request_cost=r[5],
                daily_quota=r[6],
                created_at=r[7],
                email=r[10],
                notes=r[11],
                today_requests=r[12],
                total_requests=r[13],
            )
            for r in await cursor.fetchall()
        ]


async def get_user_by_id(user_id: int) -> dict | None:
    async with get_db() as db, db.execute("SELECT * FROM users WHERE id = ?", (user_id,)) as cursor:
        row = await cursor.fetchone()
        if row:
            d = dict(row)
            return dict(
                id=d["id"],
                name=d["name"],
                api_key_hash=d["api_key_hash"],
                api_key=d.get("api_key"),
                is_active=bool(d["is_active"]),
                rate_limit=d["rate_limit"],
                max_concurrent=d["max_concurrent"],
                request_cost=d["request_cost"],
                daily_quota=d["daily_quota"],
                created_at=d["created_at"],
                email=d.get("email"),
                notes=d.get("notes"),
            )
    return None


async def get_user_by_name(name: str) -> dict | None:
    async with get_db() as db, db.execute("SELECT * FROM users WHERE name = ?", (name,)) as cursor:
        row = await cursor.fetchone()
        if row:
            d = dict(row)
            return dict(
                id=d["id"],
                name=d["name"],
                api_key_hash=d["api_key_hash"],
                is_active=bool(d["is_active"]),
                rate_limit=d["rate_limit"],
                max_concurrent=d["max_concurrent"],
                request_cost=d["request_cost"],
                daily_quota=d["daily_quota"],
                created_at=d["created_at"],
                email=d.get("email"),
                notes=d.get("notes"),
            )
    return None


async def create_user(
    name: str,
    raw_key: str,
    rate_limit: float = 2,
    max_concurrent: int = 2,
    request_cost: float = 0.001,
    daily_quota: int | None = None,
    email: str | None = None,
    notes: str | None = None,
) -> dict:
    hashed = hash_key(raw_key)
    quick = quick_hash_key(raw_key)
    async with get_db() as db:
        await db.execute(
            "INSERT INTO users (name, api_key_hash, api_key, api_key_quick_hash, rate_limit, max_concurrent, request_cost, daily_quota, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (name, hashed, raw_key, quick, rate_limit, max_concurrent, request_cost, daily_quota, email, notes),
        )
        await db.commit()
        return await get_user_by_name(name)  # type: ignore[return-value]


async def update_user(
    user_id: int,
    *,
    name: str | None = None,
    is_active: bool | None = None,
    rate_limit: float | None = None,
    max_concurrent: int | None = None,
    request_cost: float | None = None,
    daily_quota: int | None = None,
    email: str | None = None,
    notes: str | None = None,
):
    async with get_db() as db:
        if name is not None:
            await db.execute("UPDATE users SET name = ? WHERE id = ?", (name, user_id))
        if is_active is not None:
            await db.execute("UPDATE users SET is_active = ? WHERE id = ?", (is_active, user_id))
        if rate_limit is not None:
            await db.execute("UPDATE users SET rate_limit = ? WHERE id = ?", (rate_limit, user_id))
        if max_concurrent is not None:
            await db.execute("UPDATE users SET max_concurrent = ? WHERE id = ?", (max_concurrent, user_id))
        if request_cost is not None:
            await db.execute("UPDATE users SET request_cost = ? WHERE id = ?", (request_cost, user_id))
        if daily_quota is not None:
            await db.execute("UPDATE users SET daily_quota = ? WHERE id = ?", (daily_quota, user_id))
        if email is not None:
            await db.execute("UPDATE users SET email = ? WHERE id = ?", (email, user_id))
        if notes is not None:
            await db.execute("UPDATE users SET notes = ? WHERE id = ?", (notes, user_id))
        await db.commit()


async def rotate_key(user_id: int, raw_key: str):
    hashed = hash_key(raw_key)
    quick = quick_hash_key(raw_key)
    async with get_db() as db:
        await db.execute(
            "UPDATE users SET api_key_hash = ?, api_key = ?, api_key_quick_hash = ? WHERE id = ?",
            (hashed, raw_key, quick, user_id),
        )
        await db.commit()


async def soft_delete(user_id: int):
    await update_user(user_id, is_active=False)


async def upsert_usage(user_id: int, cost: float, prompt_tokens: int = 0, completion_tokens: int = 0):
    """Increment request_count and total_cost for current hour. Fire-and-forget safe."""
    from datetime import datetime

    total_tokens = prompt_tokens + completion_tokens
    hour = datetime.now(UTC).strftime("%Y-%m-%d %H:00")
    async with get_db() as db:
        await db.execute(
            """INSERT INTO user_usage (user_id, hour, request_count, total_cost, prompt_tokens, completion_tokens, total_tokens)
                            VALUES (?, ?, 1, ?, ?, ?, ?)
                            ON CONFLICT(user_id, hour)
                            DO UPDATE SET request_count = request_count + 1, total_cost = total_cost + ?,
                                          prompt_tokens = prompt_tokens + ?, completion_tokens = completion_tokens + ?,
                                          total_tokens = total_tokens + ?""",
            (
                user_id,
                hour,
                cost,
                prompt_tokens,
                completion_tokens,
                total_tokens,
                cost,
                prompt_tokens,
                completion_tokens,
                total_tokens,
            ),
        )
        await db.commit()


async def get_user_usage(user_id: int, since_str: str | None = None):
    """Get hourly usage data for a user. since_str is YYYY-MM-DD HH:MM:SS format."""
    async with get_db() as db:
        if since_str:
            async with db.execute(
                "SELECT hour, request_count, total_cost, COALESCE(prompt_tokens,0), COALESCE(completion_tokens,0), COALESCE(total_tokens,0) FROM user_usage WHERE user_id = ? AND hour >= ? ORDER BY hour",
                (user_id, since_str),
            ) as cursor:
                rows = await cursor.fetchall()
        else:
            async with db.execute(
                "SELECT hour, request_count, total_cost, COALESCE(prompt_tokens,0), COALESCE(completion_tokens,0), COALESCE(total_tokens,0) FROM user_usage WHERE user_id = ? ORDER BY hour",
                (user_id,),
            ) as cursor:
                rows = await cursor.fetchall()
        return [
            {
                "hour": r[0],
                "request_count": r[1],
                "total_cost": r[2],
                "prompt_tokens": r[3],
                "completion_tokens": r[4],
                "total_tokens": r[5],
            }
            for r in rows
        ]


async def get_user_total_today(user_id: int) -> int:
    """Get total request_count for today (UTC)."""
    from datetime import datetime

    today = datetime.now(UTC).strftime("%Y-%m-%d 00:00")
    async with (
        get_db() as db,
        db.execute(
            "SELECT COALESCE(SUM(request_count), 0) FROM user_usage WHERE user_id = ? AND hour >= ?", (user_id, today)
        ) as cursor,
    ):
        row = await cursor.fetchone()
        return row[0] if row else 0


async def get_user_summary(user_id: int) -> dict:
    """Get all-time and today summary for a user."""
    from datetime import datetime

    today = datetime.now(UTC).strftime("%Y-%m-%d 00:00")
    async with get_db() as db:
        async with db.execute(
            "SELECT COALESCE(SUM(request_count), 0), COALESCE(SUM(total_cost), 0), COALESCE(SUM(prompt_tokens), 0), COALESCE(SUM(completion_tokens), 0), COALESCE(SUM(total_tokens), 0) FROM user_usage WHERE user_id = ?",
            (user_id,),
        ) as cursor:
            all_time = await cursor.fetchone()
        async with db.execute(
            "SELECT COALESCE(SUM(request_count), 0) FROM user_usage WHERE user_id = ? AND hour >= ?", (user_id, today)
        ) as cursor:
            today_row = await cursor.fetchone()
        today_count = today_row[0] if today_row else 0

        user = await get_user_by_id(user_id)
        return {
            "total_requests": all_time[0] if all_time else 0,
            "total_cost": round(all_time[1], 4) if all_time else 0.0,
            "today_requests": today_count,
            "daily_quota": user["daily_quota"] if user else None,
            "prompt_tokens": all_time[2] if all_time else 0,
            "completion_tokens": all_time[3] if all_time else 0,
            "total_tokens": all_time[4] if all_time else 0,
        }


# ── Setup state helpers ──────────────────────────────────────────────


async def is_setup_complete() -> bool:
    """Check if the first-boot wizard has been completed."""
    async with get_db() as db, db.execute("SELECT value FROM config WHERE key = ?", ("setup_complete",)) as cursor:
        row = await cursor.fetchone()
        if row is None:
            return False
        return row["value"] == "true"


async def mark_setup_complete() -> None:
    """Mark setup as complete."""
    async with get_db() as db:
        await db.execute(
            "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", ("setup_complete", "true")
        )
        await db.commit()


async def set_admin_credentials(admin_name: str, raw_key: str) -> None:
    """Store admin name and key (hashed + encrypted) and mark setup complete.

    Uses a single DB connection to avoid nested get_db() calls that could
    lead to inconsistent state if the outer commit fails.
    """
    from .crypto import encrypt

    hashed = bcrypt_lib.hashpw(raw_key.encode("utf-8"), bcrypt_lib.gensalt()).decode("utf-8")
    encrypted = encrypt(raw_key)
    async with get_db() as db:
        await db.execute(
            "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", ("admin_name", admin_name)
        )
        await db.execute(
            "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", ("admin_api_key_hash", hashed)
        )
        await db.execute(
            "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", ("admin_api_key_enc", encrypted)
        )
        await db.execute(
            "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", ("setup_complete", "true")
        )
        await db.commit()


async def get_admin_name() -> str:
    """Get the admin display name."""
    async with get_db() as db, db.execute("SELECT value FROM config WHERE key = ?", ("admin_name",)) as cursor:
        row = await cursor.fetchone()
        if row is None:
            return "admin"
        return row["value"]


async def load_admin_api_key() -> str:
    """Decrypt and return the raw admin API key from the database."""
    from .crypto import decrypt

    async with get_db() as db, db.execute("SELECT value FROM config WHERE key = ?", ("admin_api_key_enc",)) as cursor:
        row = await cursor.fetchone()
        if row is None:
            return ""
        return decrypt(row["value"])

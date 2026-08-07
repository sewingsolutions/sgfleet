"""Async log retrieval and configuration.

Log entries are written directly to SQLite by LogDBHandler in logging.py.
Exposes get_logs() with filters and log level persistence.
"""

import logging

from .db import get_db
from .logging import set_logger_level

_app_logger: logging.Logger | None = None


async def start_persistence(logger: logging.Logger) -> None:
    """No-op: logs are now written directly by LogDBHandler."""
    global _app_logger
    _app_logger = logger


async def get_logs(
    limit: int = 100,
    level: str | None = None,
    user: str | None = None,
    path: str | None = None,
    keyword: str | None = None,
) -> list[dict]:
    conditions = []
    params: list = []

    if level:
        conditions.append("level = ?")
        params.append(level.upper())
    if user:
        conditions.append("user LIKE ?")
        params.append(f"%{user}%")
    if path:
        conditions.append("path LIKE ?")
        params.append(f"%{path}%")
    if keyword:
        conditions.append("(COALESCE(message, '') LIKE ? OR COALESCE(error, '') LIKE ? OR COALESCE(event, '') LIKE ?)")
        kw = f"%{keyword}%"
        params.extend([kw, kw, kw])

    where = " WHERE " + " AND ".join(conditions) if conditions else ""
    params.append(limit)

    async with (
        get_db() as db,
        db.execute(
            f"SELECT id, timestamp, level, event, method, path, status, latency_ms, user, request_id, ip, error, message FROM admin_log{where} ORDER BY id DESC LIMIT ?",
            params,
        ) as cursor,
    ):
        rows = await cursor.fetchall()
        return [
            {
                "id": r[0],
                "timestamp": r[1],
                "level": r[2],
                "event": r[3],
                "method": r[4],
                "path": r[5],
                "status": r[6],
                "latency_ms": r[7],
                "user": r[8],
                "request_id": r[9],
                "ip": r[10],
                "error": r[11],
                "message": r[12],
            }
            for r in rows
        ]


async def get_log_level() -> str:
    async with get_db() as db, db.execute("SELECT value FROM config WHERE key = ?", ("admin_log_level",)) as cursor:
        row = await cursor.fetchone()
        return row[0] if row else "DEBUG"


async def set_log_level(level: str) -> None:
    level = level.upper()
    if _app_logger:
        set_logger_level(_app_logger, level)
    async with get_db() as db:
        await db.execute(
            "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)",
            ("admin_log_level", level),
        )
        await db.commit()

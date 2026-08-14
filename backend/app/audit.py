"""Audit and request logging.

Writes to audit_log (admin actions) and request_log (API requests) tables.
Fire-and-forget — never blocks the main request path.
"""

import asyncio
from datetime import UTC, datetime

from .db import get_db


def _now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S")


async def log_admin_action(action: str, target_user_id: int | None, detail: str | None, ip: str | None) -> None:
    """Record an admin action. Fire-and-forget."""
    try:
        async with get_db() as db:
            await db.execute(
                "INSERT INTO audit_log (timestamp, action, target_user_id, detail, ip_address) VALUES (?, ?, ?, ?, ?)",
                (_now(), action, target_user_id, detail or "", ip or ""),
            )
            await db.commit()
    except Exception:
        pass


async def log_request(
    user_id: int | None,
    request_id: str,
    method: str,
    endpoint: str,
    status: int,
    latency_ms: float,
    error_msg: str | None,
) -> None:
    """Record an API request. Fire-and-forget."""
    try:
        async with get_db() as db:
            await db.execute(
                "INSERT INTO request_log (timestamp, user_id, request_id, method, endpoint, status, latency_ms, error_msg) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (_now(), user_id, request_id, method, endpoint, status, round(latency_ms, 2), error_msg or ""),
            )
            await db.commit()
    except Exception:
        pass


async def get_audit_log(limit: int = 200) -> list:
    """Get recent audit log entries."""
    async with (
        get_db() as db,
        db.execute(
            "SELECT id, timestamp, action, target_user_id, detail, ip_address FROM audit_log ORDER BY id DESC LIMIT ?",
            (limit,),
        ) as cursor,
    ):
        rows = await cursor.fetchall()
        return [
            {"id": r[0], "timestamp": r[1], "action": r[2], "target_user_id": r[3], "detail": r[4], "ip_address": r[5]}
            for r in rows
        ]


async def get_user_requests(user_id: int, limit: int = 100) -> list:
    """Get recent API requests for a user."""
    async with (
        get_db() as db,
        db.execute(
            "SELECT id, timestamp, user_id, request_id, method, endpoint, status, latency_ms, error_msg FROM request_log WHERE user_id = ? ORDER BY id DESC LIMIT ?",
            (user_id, limit),
        ) as cursor,
    ):
        rows = await cursor.fetchall()
        return [
            {
                "id": r[0],
                "timestamp": r[1],
                "user_id": r[2],
                "request_id": r[3],
                "method": r[4],
                "endpoint": r[5],
                "status": r[6],
                "latency_ms": r[7],
                "error_msg": r[8],
            }
            for r in rows
        ]


# Task to periodically clean up old request_log entries (keep 7 days)
CLEANUP_INTERVAL = 3600  # hourly


async def cleanup() -> None:
    while True:
        await asyncio.sleep(CLEANUP_INTERVAL)
        try:
            async with get_db() as db:
                seven_days_ago = datetime.now(UTC).timestamp() - 7 * 86400
                # Keep only last 7 days of request_log
                await db.execute(
                    "DELETE FROM request_log WHERE timestamp < ?",
                    (datetime.fromtimestamp(seven_days_ago, tz=UTC).strftime("%Y-%m-%d %H:%M:%S"),),
                )
                await db.commit()
        except Exception:
            pass

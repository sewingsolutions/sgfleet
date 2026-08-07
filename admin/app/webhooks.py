import hashlib
import hmac
import json
import logging

import httpx

from .db import get_db

_logger = logging.getLogger("sgfleet-admin")

_event_types = ["quota_warning", "quota_exceeded", "key_rotated", "user_disabled", "rate_limited_spike"]


async def notify(event: str, payload: dict) -> None:
    """Send webhook notifications for the given event. Best-effort, non-blocking."""
    async with (
        get_db() as db,
        db.execute("SELECT id, name, url, events, is_active, secret FROM webhooks WHERE is_active = 1") as cursor,
    ):
        hooks = await cursor.fetchall()
    if not hooks:
        return

    for hook in hooks:
        hook_id, name, url, events_json, is_active, secret = hook
        try:
            events = json.loads(events_json)
        except (json.JSONDecodeError, TypeError):
            continue
        if event not in events:
            continue

        body = json.dumps({"event": event, "payload": payload}).encode("utf-8")
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if secret:
            sig = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
            headers["X-Webhook-Signature"] = f"sha256={sig}"

        try:
            async with httpx.AsyncClient(timeout=5.0) as c:
                resp = await c.post(url, content=body, headers=headers)
                if resp.status_code >= 500:
                    _logger.log(
                        logging.INFO,
                        "",
                        extra={
                            "request": {
                                "event": "webhook_failure",
                                "method": "POST",
                                "path": url,
                                "status": resp.status_code,
                                "latency_ms": 0,
                                "user": None,
                                "request_id": "",
                                "ip": "",
                                "error": f"webhook_{name}_delivery_failed",
                            }
                        },
                    )
        except Exception as e:
            _logger.log(
                logging.INFO,
                "",
                extra={
                    "request": {
                        "event": "webhook_failure",
                        "method": "POST",
                        "path": url,
                        "status": 0,
                        "latency_ms": 0,
                        "user": None,
                        "request_id": "",
                        "ip": "",
                        "error": f"webhook_{name}_delivery_failed: {e}",
                    }
                },
            )

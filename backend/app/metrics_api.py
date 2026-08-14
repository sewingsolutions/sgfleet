from collections import defaultdict
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, Request

from . import metrics as real_metrics
from .admin_api import require_admin
from .db import get_all_users, get_user_by_id, get_user_usage

router = APIRouter(prefix="/api")


def parse_time_range(range_str):
    now = datetime.now(UTC)
    if range_str == "1h":
        return now - timedelta(hours=1)
    elif range_str == "6h":
        return now - timedelta(hours=6)
    elif range_str == "24h":
        return now - timedelta(hours=24)
    elif range_str == "7d":
        return now - timedelta(days=7)
    return now - timedelta(hours=24)


def generate_hourly_labels(since: datetime):
    """Generate all hourly labels from `since` to now (UTC)."""
    now = datetime.now(UTC)
    labels = []
    current = since.replace(minute=0, second=0, microsecond=0)
    while current <= now:
        labels.append(current.strftime("%Y-%m-%d %H:00"))
        current += timedelta(hours=1)
    return labels


@router.get("/users/{user_id}/stats")
async def user_stats(request: Request, user_id: int, range: str = "24h"):
    await require_admin(request)
    user = await get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    since = parse_time_range(range)
    hourly_labels = generate_hourly_labels(since)

    usage_rows = await get_user_usage(user_id, since.strftime("%Y-%m-%d %H:%M:%S"))

    usage_by_hour = defaultdict(
        lambda: {"requests": 0, "cost": 0.0, "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    )
    for row in usage_rows:
        hour = row["hour"]
        usage_by_hour[hour]["requests"] = row["request_count"]
        usage_by_hour[hour]["cost"] = row["total_cost"]
        usage_by_hour[hour]["prompt_tokens"] = row.get("prompt_tokens", 0)
        usage_by_hour[hour]["completion_tokens"] = row.get("completion_tokens", 0)
        usage_by_hour[hour]["total_tokens"] = row.get("total_tokens", 0)

    requests = [usage_by_hour[label]["requests"] for label in hourly_labels]
    costs = [usage_by_hour[label]["cost"] for label in hourly_labels]
    prompt_tokens = [usage_by_hour[label]["prompt_tokens"] for label in hourly_labels]
    completion_tokens = [usage_by_hour[label]["completion_tokens"] for label in hourly_labels]
    total_tokens = [usage_by_hour[label]["total_tokens"] for label in hourly_labels]

    display_labels = []
    for label in hourly_labels:
        if range == "7d":
            dt = datetime.strptime(label, "%Y-%m-%d %H:00")
            display_labels.append(f"{dt.strftime('%a')}\n{dt.strftime('%H:%M')}")
        else:
            dt = datetime.strptime(label, "%Y-%m-%d %H:00")
            display_labels.append(dt.strftime("%H:%M"))

    since_time = since.timestamp()
    latency_by_hour = real_metrics.get_user_latency_percentiles_per_hour(user["name"], since_time)
    c429_by_hour = real_metrics.get_user_429_per_hour(user["name"], since_time)

    latency_p50 = []
    latency_p95 = []
    count_429 = []
    for label in hourly_labels:
        if label in latency_by_hour:
            latency_p50.append(latency_by_hour[label][0])
            latency_p95.append(latency_by_hour[label][1])
        else:
            latency_p50.append(0)
            latency_p95.append(0)
        count_429.append(c429_by_hour.get(label, 0))

    return {
        "labels": display_labels,
        "requests": requests,
        "costs": costs,
        "latency_p50": latency_p50,
        "latency_p95": latency_p95,
        "count_429": count_429,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
    }


@router.get("/stats")
async def fleet_stats(request: Request, range: str = "24h"):
    await require_admin(request)

    since = parse_time_range(range)
    hourly_labels = generate_hourly_labels(since)
    since_time = since.timestamp()

    all_users = await get_all_users()

    # Per-user latency/429
    fleet_users = []
    total_req = 0
    total_c429 = 0
    total_prompt_tokens = 0
    total_completion_tokens = 0
    for user in all_users:
        um = user["name"]
        usage_rows = await get_user_usage(user["id"], since.strftime("%Y-%m-%d %H:%M:%S"))
        req_count = sum(r["request_count"] for r in usage_rows)
        total_req += req_count
        total_prompt_tokens += sum(r.get("prompt_tokens", 0) for r in usage_rows)
        total_completion_tokens += sum(r.get("completion_tokens", 0) for r in usage_rows)

        p50 = real_metrics.get_user_latency_percentiles(um, since_time, 50)
        p95 = real_metrics.get_user_latency_percentiles(um, since_time, 95)
        c429 = real_metrics.get_user_429_count(um, since_time)
        total_c429 += c429

        fleet_users.append(
            {
                "user": um,
                "p50": p50,
                "p95": p95,
                "c429": c429,
            }
        )

    # Sort by p95 desc
    fleet_users.sort(key=lambda x: x["p95"], reverse=True)

    avg_latency = real_metrics.get_fleet_total_latency(since_time)

    # Display labels
    display_labels = []
    for label in hourly_labels:
        if range == "7d":
            label_dt = datetime.strptime(label, "%Y-%m-%d %H:00")
            display_labels.append(f"{label_dt.strftime('%a')}\n{label_dt.strftime('%H:%M')}")
        else:
            label_dt = datetime.strptime(label, "%Y-%m-%d %H:00")
            display_labels.append(label_dt.strftime("%H:%M"))

    # Fleet latency over time per hour
    fleet_latency_by_hour = real_metrics.get_fleet_latency_per_hour(since_time)
    fleet_c429_by_hour = real_metrics.get_fleet_429_per_hour(since_time)

    fleet_latency_p50 = []
    fleet_latency_p95 = []
    fleet_count_429 = []
    for label in hourly_labels:
        if label in fleet_latency_by_hour:
            fleet_latency_p50.append(fleet_latency_by_hour[label][0])
            fleet_latency_p95.append(fleet_latency_by_hour[label][1])
        else:
            fleet_latency_p50.append(0)
            fleet_latency_p95.append(0)
        fleet_count_429.append(fleet_c429_by_hour.get(label, 0))

    return {
        "labels": display_labels,
        "total_requests": total_req,
        "avg_latency": avg_latency,
        "total_429": total_c429,
        "total_prompt_tokens": total_prompt_tokens,
        "total_completion_tokens": total_completion_tokens,
        "users": fleet_users,
        "latency_p50": fleet_latency_p50,
        "latency_p95": fleet_latency_p95,
        "count_429": fleet_count_429,
    }

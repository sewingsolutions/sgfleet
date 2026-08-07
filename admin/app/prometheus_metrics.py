from prometheus_client import CONTENT_TYPE_LATEST, REGISTRY, Counter, Gauge, Histogram, generate_latest

total_requests = Counter(
    "gateway_requests_total",
    "Total requests processed by the gateway",
    ["method", "endpoint", "status", "user"],
    registry=REGISTRY,
)

auth_failures = Counter(
    "gateway_auth_failures_total",
    "Total authentication failures",
    registry=REGISTRY,
)

rate_limit_rejections = Counter(
    "gateway_rate_limit_rejections_total",
    "Total requests rejected due to rate limiting",
    ["user"],
    registry=REGISTRY,
)

concurrent_limit_rejections = Counter(
    "gateway_concurrent_limit_rejections_total",
    "Total requests rejected due to concurrent connection limits",
    ["user"],
    registry=REGISTRY,
)

request_latency = Histogram(
    "gateway_request_latency_seconds",
    "Request latency in seconds",
    ["method", "endpoint", "status", "user"],
    buckets=(0.01, 0.05, 0.1, 0.5, 1.0, 5.0, 10.0, 30.0, 60.0, 120.0, 300.0),
    registry=REGISTRY,
)

upstream_status = Counter(
    "gateway_upstream_status_total",
    "Total upstream responses by status code",
    ["status", "user"],
    registry=REGISTRY,
)

active_connections = Gauge(
    "gateway_active_connections",
    "Currently active proxied connections",
    ["user"],
    registry=REGISTRY,
)


def handler():
    return generate_latest(REGISTRY).decode("utf-8"), CONTENT_TYPE_LATEST

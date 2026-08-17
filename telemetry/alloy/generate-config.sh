#!/bin/sh
set -e

OUT="/etc/alloy/runtime.alloy"

if [ -z "$PROMETHEUS_HOST" ]; then
  echo "[alloy] PROMETHEUS_HOST not set — metrics export disabled"
  cat > "$OUT" << 'EOF'
// Metrics export disabled: PROMETHEUS_HOST not configured
logging.file "disabled" {
  directory    = "/tmp/alloy"
  mode         = "file"
  flush_period = "30s"
}
EOF
else
  echo "[alloy] Metrics export enabled → ${PROMETHEUS_HOST}:9090"
  cat > "$OUT" << EOF
prometheus.scrape "sgfleet_server" {
  targets       = [{"__address__" = "sgfleet-server:30000"}]
  job_name      = "sgfleet_server"
  scrape_interval = "15s"
  forward_to    = [prometheus.remote_write.monitoring.receiver]
}

prometheus.scrape "sgfleet_admin" {
  targets       = [{"__address__" = "sgfleet-backend:8000"}]
  metrics_path  = "/api/metrics"
  job_name      = "sgfleet_admin"
  scrape_interval = "15s"
  forward_to    = [prometheus.remote_write.monitoring.receiver]
}

prometheus.remote_write "monitoring" {
  endpoint {
    url = "http://${PROMETHEUS_HOST}:9090/api/v1/write"
  }
}
EOF
fi

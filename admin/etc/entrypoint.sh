#!/bin/bash
set -e

log_msg() {
  echo "{\"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%S%z)\", \"level\": \"$1\", \"message\": \"$2\"}"
}

log_msg INFO "Starting admin..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --log-level warning

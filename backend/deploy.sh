#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
ruff check app/ tests/
ruff format app/ tests/
cd ..
export GIT_SHA="$(git rev-parse --short HEAD 2> /dev/null || echo unknown)"
export GIT_LOG="$(git log --oneline -30 2> /dev/null || true)"
docker compose up -d --build backend

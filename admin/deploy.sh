#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
ruff check app/ tests/
ruff format app/ tests/
cd ..
docker compose up -d --build admin

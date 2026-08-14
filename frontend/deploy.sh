#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
npm run lint
npm run build
cd ..
docker compose up -d --build frontend

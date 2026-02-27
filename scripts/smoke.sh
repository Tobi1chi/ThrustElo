#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:3000}"

echo "[smoke] GET /api/health"
curl -fsS "${BASE_URL}/api/health" >/dev/null

echo "[smoke] GET /api/ranking"
curl -fsS "${BASE_URL}/api/ranking?minKills=11" >/dev/null

echo "[smoke] smoke checks passed"

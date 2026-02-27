#!/usr/bin/env bash

set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/thrustelo}"
PORT="${PORT:-3000}"
RELEASES_DIR="${APP_ROOT}/releases"
CURRENT_LINK="${APP_ROOT}/current"
TIMESTAMP="$(date +%Y%m%d%H%M%S)"
NEW_RELEASE="${RELEASES_DIR}/${TIMESTAMP}"
HEALTH_URL="http://127.0.0.1:${PORT}/api/health"

mkdir -p "${RELEASES_DIR}"
PREVIOUS_RELEASE=""
if [ -L "${CURRENT_LINK}" ]; then
  PREVIOUS_RELEASE="$(readlink "${CURRENT_LINK}")"
fi

echo "[deploy] creating release: ${NEW_RELEASE}"
mkdir -p "${NEW_RELEASE}"
rsync -a --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'dist' \
  ./ "${NEW_RELEASE}/"

cd "${NEW_RELEASE}"
echo "[deploy] installing dependencies"
npm ci

echo "[deploy] building web/api artifacts"
npm run build:web
npm run build:api

ln -sfn "${NEW_RELEASE}" "${CURRENT_LINK}"
cd "${CURRENT_LINK}"

if pm2 describe thrustelo-api >/dev/null 2>&1; then
  echo "[deploy] reloading thrustelo-api"
  pm2 reload ecosystem.config.cjs --only thrustelo-api --update-env
else
  echo "[deploy] starting thrustelo-api"
  pm2 start ecosystem.config.cjs --only thrustelo-api --env production
fi

echo "[deploy] waiting for health checks"
for i in {1..10}; do
  if curl -fsS "${HEALTH_URL}" >/dev/null 2>&1; then
    echo "[deploy] health check passed"
    exit 0
  fi
  sleep 3
done

echo "[deploy] health check failed"
if [ -n "${PREVIOUS_RELEASE}" ] && [ -d "${PREVIOUS_RELEASE}" ]; then
  echo "[deploy] rolling back to ${PREVIOUS_RELEASE}"
  ln -sfn "${PREVIOUS_RELEASE}" "${CURRENT_LINK}"
  cd "${CURRENT_LINK}"
  pm2 reload ecosystem.config.cjs --only thrustelo-api --update-env
fi

exit 1

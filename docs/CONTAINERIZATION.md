# Containerization Guide

## Files

- `docker/api.Dockerfile`: API service image.
- `docker/web.Dockerfile`: Web build + Nginx image.
- `docker/nginx/web.conf`: Nginx route and cache policy.
- `docker-compose.yml`: local/host orchestration for both services.

## Quick Start

From repo root:

1. Build and start:
   - `docker compose up --build`
2. Open:
   - `http://localhost:8080`
3. Stop:
   - `docker compose down`

## Service Topology

- `web` container serves static files and proxies `/api/*` to `api:3000`.
- `api` container runs `node server/src/index.mjs`.

## Environment Variables

`api` container supports:

- `PORT` (default `3000`)
- `LOG_LEVEL` (default `info`)
- `ALLOWED_ORIGINS` (comma-separated origins)

Default in compose:

- `ALLOWED_ORIGINS=http://localhost:8080,http://127.0.0.1:8080`

## Production Notes

- Put an external reverse proxy (Nginx/Traefik/Caddy) in front for TLS.
- Keep only `web` public; `api` should remain internal.
- Pin image tags in production CI/CD and enable health checks at orchestrator level.

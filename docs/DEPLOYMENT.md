# Deployment Runbook

## Target

- OS: Ubuntu 22.04
- Runtime: Node.js 20 LTS
- Process manager: PM2
- Reverse proxy: Nginx
- TLS: Certbot (Let's Encrypt)

## Server Bootstrap

1. Install base packages:
   - `sudo apt update`
   - `sudo apt install -y nginx certbot python3-certbot-nginx rsync curl`
2. Install Node 20 and PM2:
   - `npm install -g pm2`
3. Prepare directories:
   - `sudo mkdir -p /opt/thrustelo/releases`
   - `sudo chown -R $USER:$USER /opt/thrustelo`

## App Deployment

1. Upload project into `/opt/thrustelo/current` or run from cloned repo root.
2. Run deployment script:
   - `APP_ROOT=/opt/thrustelo PORT=3000 ./scripts/deploy.sh`
3. Verify:
   - `curl -fsS http://127.0.0.1:3000/api/health`
   - `pm2 status`

## Nginx

1. Copy config:
   - `sudo cp deploy/nginx/thrustelo.conf /etc/nginx/sites-available/thrustelo.conf`
2. Update `server_name` in config.
3. Enable site:
   - `sudo ln -sf /etc/nginx/sites-available/thrustelo.conf /etc/nginx/sites-enabled/thrustelo.conf`
4. Validate and reload:
   - `sudo nginx -t`
   - `sudo systemctl reload nginx`

## TLS and Firewall

1. Open required ports:
   - `sudo ufw allow 22`
   - `sudo ufw allow 80`
   - `sudo ufw allow 443`
2. Issue certificate:
   - `sudo certbot --nginx -d thrustelo.example.com`
3. Confirm renewal:
   - `sudo systemctl status certbot.timer`

## Rollback

The deploy script automatically rolls back to previous release if health checks fail.

Manual rollback:

1. `ls -1 /opt/thrustelo/releases`
2. `ln -sfn /opt/thrustelo/releases/<previous_timestamp> /opt/thrustelo/current`
3. `cd /opt/thrustelo/current && pm2 reload ecosystem.config.cjs --only thrustelo-api --update-env`

## Container Option

If you prefer containerized deployment, use:

- `docker compose up --build -d`

Reference:

- `docs/CONTAINERIZATION.md`

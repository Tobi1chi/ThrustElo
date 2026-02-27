# Operations Checklist

## Pre-cutover

- Prepare staging DNS and production DNS records.
- Set DNS TTL to 300 seconds before cutover window.
- Deploy and validate on staging first.

## Staging Validation

- `npm run test` passes.
- `npm run smoke -- http://127.0.0.1:3000` passes.
- Manual checks:
  - Rank loads.
  - Player detail loads.
  - History/Info/Duel navigation works.
  - Favorite persists after browser refresh.

## Production Cutover

1. Deploy during low-traffic window.
2. Verify:
   - `/api/health` returns status ok.
   - Homepage loads over HTTPS.
3. Observe for 30 minutes:
   - API error ratio
   - upstream failures
   - p95 response latency

## Alert and Rollback Threshold

- Trigger rollback if:
  - health checks continuously fail, or
  - API error rate stays above 5%.

Rollback command:

- `ln -sfn /opt/thrustelo/releases/<previous_timestamp> /opt/thrustelo/current`
- `cd /opt/thrustelo/current && pm2 reload ecosystem.config.cjs --only thrustelo-api --update-env`

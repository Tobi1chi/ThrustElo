import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { buildPlayerContext, normalizeRanking } from '../../src/shared/player-data.mjs';
import { TtlCache } from './cache.mjs';
import { ApiError, UpstreamHttpError, toErrorResponse } from './errors.mjs';

const RANKING_TTL_MS = 60_000;
const PLAYER_TTL_MS = 120_000;

function parseAllowedOrigins(input) {
  if (!input) {
    return ['http://localhost:5173', 'http://127.0.0.1:5173'];
  }

  return input
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function createCorsMiddleware(allowedOrigins) {
  const allowed = new Set(allowedOrigins);

  return cors({
    origin(origin, callback) {
      if (!origin || allowed.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new ApiError(400, 'ORIGIN_NOT_ALLOWED', 'Origin is not allowed'));
    }
  });
}

export function createApp(options = {}) {
  const {
    apiClient,
    logger,
    cache = new TtlCache(),
    appVersion = 'web-dev',
    allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS),
    enableRateLimit = true
  } = options;

  if (!apiClient) {
    throw new Error('apiClient is required');
  }

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());
  app.use(helmet());
  app.use(createCorsMiddleware(allowedOrigins));

  if (enableRateLimit) {
    app.use(
      rateLimit({
        windowMs: 60_000,
        limit: 120,
        standardHeaders: true,
        legacyHeaders: false
      })
    );
  }

  app.use((req, res, next) => {
    req.requestId = randomUUID();
    req.log = logger?.child({
      requestId: req.requestId,
      method: req.method,
      path: req.path
    });

    res.setHeader('x-request-id', req.requestId);
    const start = Date.now();

    res.on('finish', () => {
      req.log?.info(
        {
          requestId: req.requestId,
          statusCode: res.statusCode,
          durationMs: Date.now() - start
        },
        'request completed'
      );
    });

    next();
  });

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      version: appVersion,
      time: Date.now()
    });
  });

  app.get('/api/ranking', async (req, res, next) => {
    try {
      const minKillsParam = req.query.minKills ?? '11';
      const minKills = Number(minKillsParam);

      if (!Number.isInteger(minKills) || minKills < 0) {
        throw new ApiError(400, 'INVALID_MIN_KILLS', 'minKills must be a non-negative integer');
      }

      const cacheKey = `ranking:${minKills}`;
      const cached = cache.get(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }

      let upstream;
      try {
        upstream = await apiClient.getRelevantUsers(req.requestId);
      } catch (error) {
        if (error instanceof UpstreamHttpError || error?.name === 'AbortError') {
          throw new ApiError(502, 'UPSTREAM_ERROR', 'Unable to fetch ranking from upstream');
        }
        throw error;
      }

      const payload = {
        updated: Date.now(),
        ranking: normalizeRanking(upstream, { minKills })
      };

      cache.set(cacheKey, payload, RANKING_TTL_MS);
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/players/:id', async (req, res, next) => {
    try {
      const playerId = req.params.id;
      if (!/^\d{1,20}$/.test(playerId)) {
        throw new ApiError(400, 'INVALID_PLAYER_ID', 'player id must be numeric');
      }

      const cacheKey = `player:${playerId}`;
      const cached = cache.get(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }

      let upstream;
      try {
        upstream = await apiClient.getUser(playerId, req.requestId);
      } catch (error) {
        if (error instanceof UpstreamHttpError && error.status === 404) {
          throw new ApiError(404, 'PLAYER_NOT_FOUND', 'player not found');
        }
        if (error instanceof UpstreamHttpError || error?.name === 'AbortError') {
          throw new ApiError(502, 'UPSTREAM_ERROR', 'Unable to fetch player from upstream');
        }
        throw error;
      }

      if (!upstream?.id) {
        throw new ApiError(404, 'PLAYER_NOT_FOUND', 'player not found');
      }

      let payload;
      try {
        payload = buildPlayerContext(upstream);
      } catch (error) {
        throw new ApiError(404, 'PLAYER_CONTEXT_EMPTY', error.message);
      }

      cache.set(cacheKey, payload, PLAYER_TTL_MS);
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  app.use((error, req, res, _next) => {
    req.log?.error(
      {
        requestId: req.requestId,
        err: error?.message,
        stack: error?.stack
      },
      'request failed'
    );

    const output = toErrorResponse(error, req.requestId);
    res.status(output.status).json(output.body);
  });

  return app;
}

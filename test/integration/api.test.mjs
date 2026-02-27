import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequest, createResponse } from 'node-mocks-http';
import { createApp } from '../../server/src/app.mjs';
import { TtlCache } from '../../server/src/cache.mjs';
import { UpstreamHttpError } from '../../server/src/errors.mjs';

function createLogger() {
  return {
    child() {
      return this;
    },
    info() {},
    warn() {},
    error() {}
  };
}

function samplePlayer() {
  return {
    id: '76561198000000000',
    elo: 2010,
    pilotNames: ['AcePilot'],
    discordId: null,
    isAlt: false,
    altIds: [],
    altParentId: null,
    isBanned: false,
    rank: 42,
    achievements: [],
    eloHistory: [
      { time: 1735689600000, elo: 2000 },
      { time: 1735693200000, elo: 2010 }
    ],
    sessions: [
      { startTime: 1735689600000, endTime: 1735693200000 }
    ],
    history: [
      '[2025-01-01T00:00:00Z] Login',
      '[2025-01-01T00:05:00Z] Kill EnemyOne (2100) with F45->Gun->F45 (1.2) Elo gained: 15. New Elo: 2015',
      '[2025-01-01T00:06:00Z] Death to EnemyOne (2100) with F45->Gun->F45 (1.2) Elo lost: 5. New Elo: 2010'
    ]
  };
}

async function invoke(app, method, url) {
  const parsed = new URL(url, 'http://localhost');
  const req = createRequest({
    method,
    url: `${parsed.pathname}${parsed.search}`,
    originalUrl: `${parsed.pathname}${parsed.search}`,
    path: parsed.pathname,
    query: Object.fromEntries(parsed.searchParams.entries())
  });
  const res = createResponse({ eventEmitter: EventEmitter });

  return new Promise((resolve, reject) => {
    res.on('end', () => {
      let body;
      try {
        body = res._getJSONData();
      } catch (_error) {
        body = res._getData();
      }

      resolve({
        status: res.statusCode,
        body
      });
    });

    app.handle(req, res, (error) => {
      if (error) {
        reject(error);
        return;
      }

      if (!res.writableEnded) {
        res.end();
      }
    });
  });
}

test('GET /api/health returns status and version', async () => {
  const app = createApp({
    apiClient: {
      getRelevantUsers: async () => [],
      getUser: async () => samplePlayer()
    },
    logger: createLogger(),
    appVersion: '1.2.3',
    enableRateLimit: false
  });

  const response = await invoke(app, 'GET', '/api/health');
  assert.equal(response.status, 200);
  assert.equal(response.body?.status, 'ok');
  assert.equal(response.body?.version, '1.2.3');
});

test('GET /api/ranking filters by minKills and uses cache', async () => {
  let rankingCalls = 0;
  const app = createApp({
    apiClient: {
      getRelevantUsers: async () => {
        rankingCalls += 1;
        return [
          { id: 1, kills: 5, deaths: 2, pilotNames: ['low'] },
          { id: 2, kills: 15, deaths: 3, pilotNames: ['high'] }
        ];
      },
      getUser: async () => samplePlayer()
    },
    cache: new TtlCache(),
    logger: createLogger(),
    enableRateLimit: false
  });

  const first = await invoke(app, 'GET', '/api/ranking?minKills=11');
  assert.equal(first.status, 200);
  assert.equal(first.body?.ranking?.length, 1);

  const second = await invoke(app, 'GET', '/api/ranking?minKills=11');
  assert.equal(second.status, 200);
  assert.equal(rankingCalls, 1);
});

test('GET /api/players/:id returns 400 on invalid id', async () => {
  const app = createApp({
    apiClient: {
      getRelevantUsers: async () => [],
      getUser: async () => samplePlayer()
    },
    logger: createLogger(),
    enableRateLimit: false
  });

  const response = await invoke(app, 'GET', '/api/players/invalid-id');
  assert.equal(response.status, 400);
  assert.equal(response.body?.error?.code, 'INVALID_PLAYER_ID');
  assert.ok(response.body?.error?.requestId);
});

test('GET /api/ranking maps upstream 5xx to 502', async () => {
  const app = createApp({
    apiClient: {
      getRelevantUsers: async () => {
        throw new UpstreamHttpError(503, 'upstream down');
      },
      getUser: async () => samplePlayer()
    },
    logger: createLogger(),
    enableRateLimit: false
  });

  const response = await invoke(app, 'GET', '/api/ranking');
  assert.equal(response.status, 502);
  assert.equal(response.body?.error?.code, 'UPSTREAM_ERROR');
  assert.ok(response.body?.error?.requestId);
});

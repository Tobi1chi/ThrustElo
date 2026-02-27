import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlayerContext, normalizeRanking, parseUserHistory } from '../../src/shared/player-data.mjs';

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
      '[2025-01-01T00:06:00Z] Death to EnemyOne (2100) with F45->Gun->F45 (1.2) Elo lost: 5. New Elo: 2010',
      '[2025-01-01T00:07:00Z] Teamkill Wingman Elo lost: 0. New Elo: 2010',
      '[2025-01-01T00:08:00Z] Death to teamkill from Wingman no elo lost'
    ]
  };
}

test('parseUserHistory parses combat/teamkill event types', () => {
  const parsed = parseUserHistory(samplePlayer());
  const types = parsed.map((item) => item.type);

  assert.ok(types.includes('Kill'));
  assert.ok(types.includes('Death to'));
  assert.ok(types.includes('Teamkill'));
  assert.ok(types.includes('Death to teamkill'));
});

test('buildPlayerContext computes enemies and aggregate fields', () => {
  const context = buildPlayerContext(samplePlayer());
  assert.equal(context.id, '76561198000000000');
  assert.equal(context.history.filter((item) => item.type === 'Kill').length, 1);
  assert.equal(context.history.filter((item) => item.type === 'Death to').length, 1);
  assert.equal(context.tks, 1);
  assert.equal(context.tds, 1);
  assert.ok(Array.isArray(context.enemies));
  assert.ok(context.weapons.weapon.kill.Gun >= 1);
});

test('normalizeRanking filters and computes kd', () => {
  const ranking = normalizeRanking(
    [
      { id: 1, kills: 10, deaths: 2, pilotNames: ['low'] },
      { id: 2, kills: 12, deaths: 0, pilotNames: ['high'] }
    ],
    { minKills: 11 }
  );

  assert.equal(ranking.length, 1);
  assert.equal(ranking[0].id, 2);
  assert.equal(ranking[0].kd, Infinity);
});

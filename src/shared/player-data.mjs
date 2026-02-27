import moment from 'moment';

const COMBAT_TYPES = ['Death to', 'Kill'];
const TEAM_TYPES = ['Teamkill', 'Death to teamkill'];

function safeToFixed(value, digits) {
  if (!Number.isFinite(value)) {
    return value;
  }
  return Number(value.toFixed(digits));
}

export function normalizeRanking(players, options = {}) {
  const minKills = Number.isFinite(Number(options.minKills)) ? Number(options.minKills) : 11;
  if (!Array.isArray(players)) {
    return [];
  }

  const ranking = players
    .filter((item) => item && item.kills >= minKills && Array.isArray(item.pilotNames) && item.pilotNames.length > 0)
    .map((item) => {
      const player = { ...item };
      if (player.isBanned) {
        player.rank = null;
      }
      player.kd = player.deaths === 0 ? Infinity : safeToFixed(player.kills / player.deaths, 4);
      return player;
    });

  return ranking;
}

export function parseUserHistory(player) {
  const history = [];
  let afterLogin = true;
  const lines = Array.isArray(player?.history) ? player.history : [];

  lines.forEach((line) => {
    const match = line.split(/^\[(.*?)\] (.*)/);
    if (!match[1]) {
      return;
    }

    const time = moment(match[1]).valueOf();
    const payload = match[2];

    if (['Login', 'Logout'].includes(payload)) {
      afterLogin = true;
      history.push({ time, type: payload });
      return;
    }

    const type = ['Death to teamkill', 'Teamkill', 'Kill', 'Death to', 'Replay link']
      .find((candidate) => payload.startsWith(candidate));

    if (!type || type === 'Replay link') {
      return;
    }

    const params = payload.replace(`${type} `, '');
    const target = {};
    const gun = {};
    let elo;
    let newElo;

    if (COMBAT_TYPES.includes(type)) {
      const details = params.split(/(.*?) \((\d+)\) with (\w+)\-\>(\w+)\-\>(\w+) \((\d+\.\d+|\w+)\) (.+)/);
      details.shift();
      details.pop();

      target.name = details.shift();
      target.elo = parseInt(details.shift(), 10);
      gun.from = details.shift();
      gun.type = details.shift();
      gun.to = details.shift();
      gun.multiplier = details.shift();
      if (gun.multiplier === 'undefined') {
        gun.multiplier = '?';
      }

      details[0] = details[0]?.trimStart() || '';
      const distance = details[0].split(/^Distance: (\d+\.\d)nm (.+)/);
      if (distance[1]) {
        gun.distance = distance[1];
        details[0] = distance[2];
      }

      const eloMatch = details[0].split(/^Elo (lost|gained): (\d+)\. New Elo: (\d+)/);
      if (!eloMatch[1]) {
        return;
      }

      newElo = parseInt(eloMatch[3], 10);
      elo = eloMatch[1] === 'gained' ? Number(eloMatch[2]) : -Number(eloMatch[2]);
    } else if (type === 'Teamkill') {
      const teamkill = params.split(/(.*?) Elo lost: \d+. New Elo: (\d+)/);
      target.name = teamkill[1];
      newElo = parseInt(teamkill[2], 10);
      elo = 0;
    } else if (type === 'Death to teamkill') {
      const teamdeath = params.split(/from (.*?) no elo lost/);
      target.name = teamdeath[1];
      elo = 0;
    }

    history.push({
      time,
      type,
      player: target,
      gun,
      elo,
      newElo,
      afterlogin: afterLogin && COMBAT_TYPES.includes(type)
    });

    if (COMBAT_TYPES.includes(type)) {
      afterLogin = false;
    }
  });

  return history.sort((a, b) => a.time - b.time);
}

function buildEloHistory(data) {
  let eloHistory = { start: null };
  const input = Array.isArray(data?.eloHistory) ? data.eloHistory : [];

  if (!input.length) {
    return eloHistory;
  }

  const sorted = input.slice().sort((a, b) => a.time - b.time);
  const reduced = sorted.reduce(
    (acc, item) => {
      acc.nadir = Math.min(acc.nadir, item.elo);
      acc.peak = Math.max(acc.peak, item.elo);
      return acc;
    },
    {
      peak: -Infinity,
      nadir: Infinity,
      data: sorted,
      start: sorted[0].time,
      end: sorted[sorted.length - 1].time
    }
  );

  return reduced;
}

function buildSessions(data, eloHistoryStart) {
  let sessions = Array.isArray(data?.sessions)
    ? data.sessions
      .slice()
      .sort((a, b) => a.startTime - b.startTime)
      .filter((item) => item.startTime !== 0 && item.endTime !== 0 && item.startTime > eloHistoryStart)
    : [];

  if (!sessions.length) {
    return null;
  }

  const hours = sessions.reduce((acc, item) => acc + (item.endTime - item.startTime), 0) / (1000 * 3600);

  sessions = sessions.reduce(
    (acc, item, index, list) => {
      if (index === 0) {
        acc.data.push({ start: item.startTime });
      } else if (item.startTime > list[index - 1].endTime + 1000 * 3600 * 2) {
        acc.data[acc.data.length - 1].end = list[index - 1].endTime;
        acc.data.push({ start: item.startTime });
      }

      if (index === list.length - 1) {
        acc.data[acc.data.length - 1].end = item.endTime;
      }
      return acc;
    },
    {
      start: sessions[0].startTime,
      end: sessions[sessions.length - 1].endTime,
      data: []
    }
  );

  sessions.hours = hours;
  return sessions;
}

function buildEnemies(history) {
  let enemies = history
    .filter((event) => [...COMBAT_TYPES, ...TEAM_TYPES].includes(event.type))
    .reduce((acc, event) => {
      const target = acc.find((item) => item.name === event.player.name);

      if (target) {
        if (COMBAT_TYPES.includes(event.type)) {
          target.events += 1;
          target.eavarage += event.player.elo;
          if (event.type === 'Kill') {
            target.k += 1;
          } else {
            target.d += 1;
          }
          target.netelo += event.elo;
        } else {
          target.teamevents += 1;
          if (event.type === 'Teamkill') {
            target.tk += 1;
          } else {
            target.td += 1;
          }
        }
      } else {
        acc.push({
          name: event.player.name,
          events: COMBAT_TYPES.includes(event.type) ? 1 : 0,
          teamevents: TEAM_TYPES.includes(event.type) ? 1 : 0,
          eavarage: event.player.elo || 0,
          k: event.type === 'Kill' ? 1 : 0,
          d: event.type === 'Death to' ? 1 : 0,
          tk: event.type === 'Teamkill' ? 1 : 0,
          td: event.type === 'Death to teamkill' ? 1 : 0,
          netelo: event.elo
        });
      }

      return acc;
    }, []);

  enemies.forEach((target) => {
    target.eavarage = target.events > 0 ? Math.round(target.eavarage / target.events) : 0;
    target.kd = target.d === 0 ? Infinity : safeToFixed(target.k / target.d, 4);
  });

  enemies = enemies.sort((a, b) => {
    if (a.events === b.events) {
      return a.name > b.name ? 1 : -1;
    }
    return a.events < b.events ? 1 : -1;
  });

  return enemies;
}

function buildWeapons(history) {
  return history
    .filter((event) => COMBAT_TYPES.includes(event.type))
    .reduce(
      (acc, event) => {
        if (event.type === 'Kill') {
          acc.plane.kill_in[event.gun.from] = (acc.plane.kill_in[event.gun.from] || 0) + 1;
          acc.plane.kill_to[event.gun.to] = (acc.plane.kill_to[event.gun.to] || 0) + 1;
          acc.weapon.kill[event.gun.type] = (acc.weapon.kill[event.gun.type] || 0) + 1;
        } else {
          acc.plane.death_in[event.gun.to] = (acc.plane.death_in[event.gun.to] || 0) + 1;
          acc.plane.death_by[event.gun.from] = (acc.plane.death_by[event.gun.from] || 0) + 1;
          acc.weapon.death[event.gun.type] = (acc.weapon.death[event.gun.type] || 0) + 1;
        }
        return acc;
      },
      {
        plane: {
          kill_in: {},
          kill_to: {},
          death_in: {},
          death_by: {}
        },
        weapon: {
          kill: {},
          death: {}
        }
      }
    );
}

function buildAvgDeltaElo(history) {
  const stats = history
    .filter((event) => COMBAT_TYPES.includes(event.type))
    .reduce(
      (acc, event) => {
        if (event.type === 'Kill') {
          acc.elo.victim += event.player.elo;
          acc.elo.deltavictim += event.elo * 2 + event.player.elo - event.newElo;
          acc.type.kill += 1;
        } else {
          acc.elo.antagonist += event.player.elo;
          acc.elo.deltaantagonist += -event.elo * 2 + event.player.elo - event.newElo;
          acc.type.death += 1;
        }
        return acc;
      },
      {
        elo: {
          victim: 0,
          antagonist: 0,
          deltavictim: 0,
          deltaantagonist: 0
        },
        type: {
          kill: 0,
          death: 0
        }
      }
    );

  if (stats.type.kill > 0) {
    stats.elo.victim = Math.round(stats.elo.victim / stats.type.kill);
    stats.elo.deltavictim = Math.round(stats.elo.deltavictim / stats.type.kill);
  }

  if (stats.type.death > 0) {
    stats.elo.antagonist = Math.round(stats.elo.antagonist / stats.type.death);
    stats.elo.deltaantagonist = Math.round(stats.elo.deltaantagonist / stats.type.death);
  }

  return stats;
}

function buildTeamInfo(history, eventType) {
  return history
    .filter((event) => event.type === eventType)
    .reduce((acc, event) => {
      const target = acc.find((item) => item.name === event.player.name);
      if (target) {
        target.events += 1;
      } else {
        acc.push({
          name: event.player.name,
          events: 1
        });
      }
      return acc;
    }, [])
    .sort((a, b) => b.events - a.events);
}

export function buildPlayerContext(data) {
  const history = parseUserHistory(data);
  if (!history.length) {
    throw new Error('Did not find any datapoints in received data');
  }

  const eloHistory = buildEloHistory(data);
  const sessions = buildSessions(data, eloHistory.start);
  const enemies = buildEnemies(history);
  const weapons = buildWeapons(history);
  const avgdeltaelo = buildAvgDeltaElo(history);
  const tks = history.filter((event) => event.type === 'Teamkill');
  const tds = history.filter((event) => event.type === 'Death to teamkill');

  return {
    history,
    enemies,
    elo: data.elo,
    id: data.id,
    pilotName: data.pilotNames?.[0],
    pilotNames: data.pilotNames || [],
    discordId: data.discordId,
    isAlt: data.isAlt,
    altIds: data.altIds,
    altParentId: data.altParentId,
    weapons,
    achievements: data.achievements,
    eloHistory,
    sessions,
    rank: data.isBanned ? null : data.rank,
    isBanned: data.isBanned,
    tks: tks.length,
    tds: tds.length,
    avgdeltaelo,
    tksinfo: buildTeamInfo(history, 'Teamkill'),
    tdsinfo: buildTeamInfo(history, 'Death to teamkill')
  };
}

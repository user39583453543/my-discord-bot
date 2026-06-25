const axios = require('axios');

const BASE = 'https://api.battlemetrics.com';

function headers() {
  const token = process.env.BATTLEMETRICS_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function searchServers(query, game = 'rust') {
  const res = await axios.get(`${BASE}/servers`, {
    params: {
      'filter[game]': game,
      'filter[search]': query,
      'page[size]': 5,
      'sort': '-players',
    },
    headers: headers(),
  });
  return res.data.data;
}

async function getServer(serverId) {
  const res = await axios.get(`${BASE}/servers/${serverId}`, { headers: headers() });
  return res.data.data;
}

async function searchPlayers(name) {
  const res = await axios.get(`${BASE}/players`, {
    params: { 'filter[search]': name, 'page[size]': 5 },
    headers: headers(),
  });
  return res.data.data;
}

async function getPlayer(playerId) {
  const res = await axios.get(`${BASE}/players/${playerId}`, { headers: headers() });
  return res.data.data;
}

async function getPlayerSessions(playerId) {
  const res = await axios.get(`${BASE}/players/${playerId}/relationships/servers`, {
    params: { 'page[size]': 5 },
    headers: headers(),
  });
  return res.data.data;
}

async function getPlayerCurrentServer(playerId) {
  try {
    const player = await getPlayer(playerId);
    const serverId = player.relationships?.server?.data?.id || null;
    if (!serverId) return null;
    const server = await getServer(serverId);
    return {
      id: serverId,
      name: server.attributes.name,
      players: server.attributes.players,
      maxPlayers: server.attributes.maxPlayers,
    };
  } catch {
    return null;
  }
}

async function getPlayerServerPlaytime(playerId) {
  const names = {};
  const rows = [];
  let url = `${BASE}/players/${playerId}/relationships/servers`;
  let params = { 'page[size]': 100, 'include': 'server' };
  let pages = 0;

  while (url && pages < 20) {
    const res = await axios.get(url, { params, headers: headers() });
    for (const inc of res.data.included || []) {
      if (inc.type === 'server') names[inc.id] = inc.attributes?.name;
    }
    for (const d of res.data.data || []) {
      rows.push({
        id: d.id,
        name: names[d.id] || null,
        timePlayed: d.meta?.timePlayed || 0,
        lastSeen: d.meta?.lastSeen || null,
        online: !!d.meta?.online,
      });
    }
    url = res.data.links?.next || null;
    params = undefined;
    pages += 1;
  }

  for (const row of rows) {
    if (!row.name) row.name = names[row.id] || null;
  }

  return rows.sort((a, b) => b.timePlayed - a.timePlayed);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getPlayerById(playerId) {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await axios.get(`${BASE}/players/${playerId}`, { headers: headers() });
      return res.data.data || null;
    } catch (err) {
      const status = err.response?.status;
      if (status === 404) return null;
      lastErr = err;
      if (status === 429 || (status >= 500 && status < 600)) {
        await sleep(600 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function getPlayerBySteamId(steamId) {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await axios.get(`${BASE}/players`, {
        params: {
          'filter[identifiers]': steamId,
          'page[size]': 1,
        },
        headers: headers(),
      });
      return res.data.data.length ? res.data.data[0] : null;
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      if (status === 429 || (status >= 500 && status < 600)) {
        await sleep(600 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

module.exports = { searchServers, getServer, searchPlayers, getPlayer, getPlayerById, getPlayerSessions, getPlayerCurrentServer, getPlayerBySteamId, getPlayerServerPlaytime };

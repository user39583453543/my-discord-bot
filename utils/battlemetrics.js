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

module.exports = { searchServers, getServer, searchPlayers, getPlayer, getPlayerSessions, getPlayerCurrentServer };

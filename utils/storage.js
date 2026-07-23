const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function filePathFor(guildId) {
  return path.join(DATA_DIR, `${guildId}.json`);
}

function defaultData() {
  return {
    roster: {
      title: 'TEAM ROSTER',
      messageId: null,
      channelId: null,
      members: [],
    },
    links: {
      discord: null,
      telegram: null,
      youtube: null,
    },
    tickets: {
      config: {
        staffRoleId: null,
        logChannelId: null,
        categoryId: null,
        counter: 0,
        questions: [],
        acceptRoleId: null,
        declinedRoleId: null,
      },
      active: {},
    },
    tracker: {
      tracked: [],
      playtimeServerId: null,
      playtimeServerName: null,
      wipe: { dayOfWeek: 4, hour: 17, tz: 'Europe/London' },
      wipeBoard: null,
    },
    vip: {
      logChannelId: null,
      members: [],
    },
  };
}

function migrateData(data) {
  if (!data.tickets) data.tickets = defaultData().tickets;
  if (!data.tickets.active) data.tickets.active = {};
  if (!data.tickets.config) data.tickets.config = defaultData().tickets.config;
  if (!data.tickets.config.questions) data.tickets.config.questions = [];
  if (!data.tickets.config.acceptRoleId) data.tickets.config.acceptRoleId = null;
  if (!data.tickets.config.declinedRoleId) data.tickets.config.declinedRoleId = null;
  if (!data.tracker) data.tracker = { tracked: [] };
  if (data.tracker.playtimeServerId === undefined) {
    data.tracker.playtimeServerId = null;
    data.tracker.playtimeServerName = null;
  }
  if (!data.tracker.wipe) {
    data.tracker.wipe = { dayOfWeek: 4, hour: 17, tz: 'Europe/London' };
  }
  if (data.tracker.wipeBoard === undefined) {
    data.tracker.wipeBoard = null;
  }
  if (!data.vip) data.vip = { logChannelId: null, members: [] };
  if (data.vip.logChannelId === undefined) data.vip.logChannelId = null;
  if (!data.vip.members) data.vip.members = [];
  return data;
}

// In-memory cache — survives for the lifetime of the process
const cache = {};

function getGuildData(guildId) {
  // Return cached copy if available (always up to date since saveGuildData updates it)
  if (cache[guildId]) return cache[guildId];

  const file = filePathFor(guildId);
  if (!fs.existsSync(file)) {
    const d = defaultData();
    cache[guildId] = d;
    return d;
  }
  try {
    const data = migrateData(JSON.parse(fs.readFileSync(file, 'utf8')));
    cache[guildId] = data;
    return data;
  } catch {
    const d = defaultData();
    cache[guildId] = d;
    return d;
  }
}

function saveGuildData(guildId, data) {
  cache[guildId] = data;
  try {
    fs.writeFileSync(filePathFor(guildId), JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`[storage] Failed to write data for guild ${guildId}:`, err);
  }
}

module.exports = { getGuildData, saveGuildData };

// Guild data storage.
//
// With DATABASE_URL set (Replit PostgreSQL), everything is kept in the database, so open
// tickets, roles, VIPs, tracked players etc. survive redeploys.
// Without it, data falls back to JSON files in /data, which Replit WIPES on every redeploy.
//
// getGuildData / saveGuildData stay synchronous like before: all data is loaded into memory
// once at startup (init), and saves update memory instantly then write to the DB in the background.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USE_DB = !!process.env.DATABASE_URL;

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
        categoryQuestions: {},
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
    rolesync: {
      sourceRoleId: null,
      targetGuildId: null,
      targetRoleId: null,
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
  if (!data.tickets.config.categoryQuestions) data.tickets.config.categoryQuestions = {};
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
  if (!data.rolesync) data.rolesync = { sourceRoleId: null, targetGuildId: null, targetRoleId: null };
  if (data.rolesync.sourceRoleId === undefined) data.rolesync.sourceRoleId = null;
  if (data.rolesync.targetGuildId === undefined) data.rolesync.targetGuildId = null;
  if (data.rolesync.targetRoleId === undefined) data.rolesync.targetRoleId = null;
  return data;
}

// ---------- local JSON files (fallback, and one-time import source) ----------

function filePathFor(guildId) {
  return path.join(DATA_DIR, `${guildId}.json`);
}

function readFile(guildId) {
  const file = filePathFor(guildId);
  if (!fs.existsSync(file)) return null;
  try {
    return migrateData(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (err) {
    console.error(`[storage] Could not read ${file}:`, err.message);
    return null;
  }
}

function writeFile(guildId, data) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(filePathFor(guildId), JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`[storage] Failed to write data for guild ${guildId}:`, err);
  }
}

// ---------- PostgreSQL ----------

let pool = null;
const UPSERT_SQL = `
  INSERT INTO guild_data (guild_id, data, updated_at)
  VALUES ($1, $2::jsonb, now())
  ON CONFLICT (guild_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;

// One background writer per guild. Rapid saves are merged: we always write the latest data.
const writers = new Map(); // guildId -> { running, dirty, promise }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function schedulePersist(guildId) {
  let w = writers.get(guildId);
  if (!w) {
    w = { running: false, dirty: false, promise: Promise.resolve() };
    writers.set(guildId, w);
  }
  w.dirty = true;
  if (!w.running) w.promise = runWriter(guildId, w);
}

async function runWriter(guildId, w) {
  w.running = true;
  let delay = 2000;
  while (w.dirty) {
    w.dirty = false;
    try {
      await pool.query(UPSERT_SQL, [guildId, JSON.stringify(cache[guildId])]);
      delay = 2000;
    } catch (err) {
      console.error(`[storage] DB save failed for guild ${guildId}, retrying in ${delay / 1000}s:`, err.message);
      w.dirty = true;
      await sleep(delay);
      delay = Math.min(delay * 2, 60000);
    }
  }
  w.running = false;
}

// ---------- public API ----------

const cache = {};
let ready = !USE_DB;

// Call once before the bot logs in.
async function init() {
  if (!USE_DB) {
    console.warn('[storage] DATABASE_URL not set: saving to local files. Data WILL be lost on redeploy.');
    return;
  }

  const { Pool } = require('pg');
  pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  pool.on('error', (err) => console.error('[storage] Idle DB connection error:', err.message));

  await pool.query(`
    CREATE TABLE IF NOT EXISTS guild_data (
      guild_id   TEXT PRIMARY KEY,
      data       JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  const { rows } = await pool.query('SELECT guild_id, data FROM guild_data');
  for (const row of rows) cache[row.guild_id] = migrateData(row.data);

  // First run with the database: copy over any old JSON files that aren't in it yet.
  let imported = 0;
  if (fs.existsSync(DATA_DIR)) {
    for (const file of fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'))) {
      const guildId = path.basename(file, '.json');
      if (cache[guildId]) continue;
      const data = readFile(guildId);
      if (!data) continue;
      cache[guildId] = data;
      await pool.query(UPSERT_SQL, [guildId, JSON.stringify(data)]);
      imported++;
    }
  }

  ready = true;
  console.log(`[storage] Connected to database: ${rows.length} guild(s) loaded${imported ? `, ${imported} imported from old files` : ''}.`);
}

function getGuildData(guildId) {
  if (!ready) throw new Error('[storage] getGuildData called before storage.init() finished');
  if (cache[guildId]) return cache[guildId];
  const data = (!USE_DB && readFile(guildId)) || defaultData();
  cache[guildId] = data;
  return data;
}

function saveGuildData(guildId, data) {
  cache[guildId] = data;
  if (USE_DB) schedulePersist(guildId);
  else writeFile(guildId, data);
}

// Wait for pending DB writes (used on shutdown so nothing is lost mid-redeploy).
async function flush(timeoutMs = 8000) {
  if (!USE_DB) return;
  const all = Promise.all([...writers.values()].map((w) => w.promise));
  await Promise.race([all, sleep(timeoutMs)]);
  await pool.end().catch(() => {});
}

module.exports = { init, flush, getGuildData, saveGuildData };

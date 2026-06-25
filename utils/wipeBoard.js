const { EmbedBuilder } = require('discord.js');
const { GOLD } = require('../theme');
const { getGuildData, saveGuildData } = require('./storage');
const { getLastWipeBoundary } = require('./wipe');

const POLL_INTERVAL = 60_000;
const MAX_NAMES = Infinity;
const FIELD_LIMIT = 1024;
const TOTAL_LIMIT = 5800;
const NAME_LIMIT = 40;
const GONE_CODES = new Set([10003, 10008]);

function liveMs(entry, now) {
  let ms = entry.wipeMs || 0;
  if (entry.online && entry.lastTickAt) {
    const delta = now - entry.lastTickAt;
    if (delta > 0 && delta <= POLL_INTERVAL * 3) ms += delta;
  }
  return ms;
}

function buildBoardEmbed(data, now) {
  const fmtH = (ms) => (ms / 3_600_000).toFixed(1);
  const rows = (data.tracker.tracked || [])
    .filter((t) => t.filterServerId)
    .map((t) => ({ name: t.name, ms: liveMs(t, now), online: t.online, server: t.filterServerName, discordName: t.discordName }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, MAX_NAMES);

  const serverName = rows[0]?.server || 'the server';
  const embed = new EmbedBuilder()
    .setColor(GOLD)
    .setTitle('⏱️ Hours — Live Leaderboard')
    .setDescription(`Hours played on **${serverName}**.\nUpdates automatically every 30 minutes. Use \`/wipehours reset\` to reset all counters.`)
    .setFooter({ text: 'Last updated' })
    .setTimestamp();

  if (!rows.length) {
    embed.addFields({ name: '\u200b', value: 'No players tracked on a specific server yet.', inline: false });
    return embed;
  }

  const lines = rows.map((r, i) => {
    const ingame = String(r.name).slice(0, NAME_LIMIT);
    const dn = r.discordName ? String(r.discordName).replace(/[@*_`~|]/g, '').replace(/^[\s\-–—:|]+/, '').slice(0, NAME_LIMIT).trim() : '';
    const who = dn ? dn : ingame;
    return `**${i + 1}.** ${r.online ? '🟢' : '🔴'} ${who} — **${fmtH(r.ms)} h**`;
  });

  let total = 0;
  let chunk = '';
  let truncated = false;
  for (const line of lines) {
    const piece = line + '\n';
    if (total + piece.length > TOTAL_LIMIT) { truncated = true; break; }
    if (chunk.length + piece.length > FIELD_LIMIT) {
      embed.addFields({ name: '\u200b', value: chunk, inline: false });
      chunk = '';
    }
    chunk += piece;
    total += piece.length;
  }
  if (chunk) embed.addFields({ name: '\u200b', value: chunk, inline: false });
  if (truncated) embed.addFields({ name: '\u200b', value: '…and more (list too long to show everyone).', inline: false });
  return embed;
}

async function updateBoard(client, guildId) {
  const data = getGuildData(guildId);
  const board = data.tracker.wipeBoard;
  if (!board || !board.channelId || !board.messageId) return;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  let channel = guild.channels.cache.get(board.channelId);
  if (!channel) {
    try { channel = await guild.channels.fetch(board.channelId); }
    catch (err) { if (GONE_CODES.has(err?.code)) clearBoard(guildId, data); return; }
  }
  if (!channel) { clearBoard(guildId, data); return; }

  try {
    const msg = await channel.messages.fetch(board.messageId);
    await msg.edit({ embeds: [buildBoardEmbed(data, Date.now())], allowedMentions: { parse: [] } });
  } catch (err) {
    if (GONE_CODES.has(err?.code)) clearBoard(guildId, data);
    else console.error('[WipeBoard] update failed (will retry):', err?.message || err);
  }
}

function clearBoard(guildId, data) {
  data.tracker.wipeBoard = null;
  saveGuildData(guildId, data);
}

async function updateAllBoards(client) {
  if (!client) return;
  for (const guild of client.guilds.cache.values()) {
    await updateBoard(client, guild.id).catch(() => {});
  }
}

module.exports = { liveMs, buildBoardEmbed, updateBoard, updateAllBoards };

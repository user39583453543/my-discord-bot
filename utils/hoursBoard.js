const { EmbedBuilder } = require('discord.js');
const { GOLD } = require('../theme');
const { getGuildData, saveGuildData } = require('./storage');
const axios = require('axios');

const FIELD_LIMIT = 1024;
const TOTAL_LIMIT = 5800;
const NAME_LIMIT = 40;
const GONE_CODES = new Set([10003, 10008]);

function bmHeaders() {
  const token = process.env.BATTLEMETRICS_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch a player's playtime (in seconds) on a specific BM server via their Steam ID.
 * Returns null if the player is not found or has no record on that server.
 */
async function fetchPlaytimeForSteamId(steamId, serverId) {
  // Step 1: resolve Steam ID → BM player
  let player = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await axios.get('https://api.battlemetrics.com/players', {
        params: {
          'filter[identifiers]': steamId,
          'page[size]': 1,
        },
        headers: bmHeaders(),
      });
      player = res.data.data.length ? res.data.data[0] : null;
      break;
    } catch (err) {
      const status = err.response?.status;
      if (status === 404) break;
      if (status === 429 || (status >= 500 && status < 600)) {
        await sleep(800 * (attempt + 1));
        continue;
      }
      break;
    }
  }

  if (!player) return null;

  // Step 2: fetch server-specific playtime from player/relationships/servers
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await axios.get(
        `https://api.battlemetrics.com/players/${player.id}/relationships/servers`,
        {
          params: {
            'filter[server]': serverId,
            'page[size]': 1,
          },
          headers: bmHeaders(),
        }
      );
      const record = res.data.data.find((d) => d.id === serverId);
      return {
        bmPlayerId: player.id,
        name: player.attributes.name,
        timePlayed: record?.meta?.timePlayed || 0,
        online: !!record?.meta?.online,
      };
    } catch (err) {
      const status = err.response?.status;
      if (status === 429 || (status >= 500 && status < 600)) {
        await sleep(800 * (attempt + 1));
        continue;
      }
      break;
    }
  }

  return { bmPlayerId: player.id, name: player.attributes.name, timePlayed: 0, online: false };
}

/**
 * Build the leaderboard embed from a sorted list of player results.
 */
function buildHoursBoardEmbed(serverId, players) {
  const fmtH = (sec) => (sec / 3600).toFixed(1);

  const embed = new EmbedBuilder()
    .setColor(GOLD)
    .setTitle('🏆 Hours Leaderboard')
    .setDescription(
      `Playtime on BattleMetrics server \`${serverId}\`.\nUpdates automatically every 30 minutes.`
    )
    .setFooter({ text: 'Last updated' })
    .setTimestamp();

  if (!players.length) {
    embed.addFields({ name: '\u200b', value: 'No player data available yet.', inline: false });
    return embed;
  }

  const lines = players.map((p, i) => {
    const safeName = String(p.name || 'Unknown').slice(0, NAME_LIMIT);
    const dn = p.displayName
      ? String(p.displayName)
          .replace(/[@*_`~|]/g, '')
          .replace(/^[\s\-–—:|]+/, '')
          .slice(0, NAME_LIMIT)
          .trim()
      : '';
    const who = dn ? `${safeName} (${dn})` : safeName;
    return `**${i + 1}.** ${p.online ? '🟢' : '🔴'} ${who} — **${fmtH(p.timePlayed)} h**`;
  });

  let total = 0;
  let chunk = '';
  let truncated = false;
  for (const line of lines) {
    const piece = line + '\n';
    if (total + piece.length > TOTAL_LIMIT) {
      truncated = true;
      break;
    }
    if (chunk.length + piece.length > FIELD_LIMIT) {
      embed.addFields({ name: '\u200b', value: chunk, inline: false });
      chunk = '';
    }
    chunk += piece;
    total += piece.length;
  }
  if (chunk) embed.addFields({ name: '\u200b', value: chunk, inline: false });
  if (truncated) {
    embed.addFields({ name: '\u200b', value: '…and more (list too long to show everyone).', inline: false });
  }

  return embed;
}

/**
 * Fetch playtime for all players in a guild's hoursBoard config and update the embed.
 */
async function updateHoursBoard(client, guildId) {
  const data = getGuildData(guildId);
  const board = data.hoursBoard;
  if (!board || !board.channelId || !board.serverId || !board.players || !board.players.length) return;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  let channel = guild.channels.cache.get(board.channelId);
  if (!channel) {
    try {
      channel = await guild.channels.fetch(board.channelId);
    } catch (err) {
      if (GONE_CODES.has(err?.code)) {
        data.hoursBoard.messageId = null;
        saveGuildData(guildId, data);
      }
      return;
    }
  }
  if (!channel) return;

  // Fetch playtime for each player (rate-limit friendly: 200ms between requests)
  const results = [];
  for (const p of board.players) {
    try {
      const result = await fetchPlaytimeForSteamId(p.steamId, board.serverId);
      if (result) {
        results.push({ ...result, displayName: p.name });
      } else {
        results.push({ name: p.name, displayName: p.name, timePlayed: 0, online: false });
      }
    } catch {
      results.push({ name: p.name, displayName: p.name, timePlayed: 0, online: false });
    }
    await sleep(200);
  }

  // Sort by hours descending
  results.sort((a, b) => b.timePlayed - a.timePlayed);

  const embed = buildHoursBoardEmbed(board.serverId, results);

  try {
    if (board.messageId) {
      // Try to edit the existing message
      try {
        const msg = await channel.messages.fetch(board.messageId);
        await msg.edit({ embeds: [embed], allowedMentions: { parse: [] } });
      } catch (err) {
        if (GONE_CODES.has(err?.code)) {
          // Message was deleted — post a new one
          const newMsg = await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
          data.hoursBoard.messageId = newMsg.id;
          saveGuildData(guildId, data);
        } else {
          console.error('[HoursBoard] edit failed (will retry):', err?.message || err);
        }
      }
    } else {
      // No message yet — post a fresh one
      const newMsg = await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
      data.hoursBoard.messageId = newMsg.id;
      saveGuildData(guildId, data);
    }
  } catch (err) {
    console.error('[HoursBoard] failed to send/edit embed:', err?.message || err);
  }
}

async function updateAllHoursBoards(client) {
  if (!client) return;
  for (const guild of client.guilds.cache.values()) {
    await updateHoursBoard(client, guild.id).catch((err) =>
      console.error(`[HoursBoard] guild ${guild.id} error:`, err?.message || err)
    );
  }
}

module.exports = { updateHoursBoard, updateAllHoursBoards, buildHoursBoardEmbed, fetchPlaytimeForSteamId };

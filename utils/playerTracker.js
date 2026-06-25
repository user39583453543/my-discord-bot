const { EmbedBuilder } = require('discord.js');
const { getPlayerCurrentServer } = require('./battlemetrics');
const { getGuildData, saveGuildData } = require('./storage');
const { getLastWipeBoundary } = require('./wipe');
const { updateAllBoards } = require('./wipeBoard');
const { updateAllHoursBoards } = require('./hoursBoard');
const { GOLD } = require('../theme');

let client = null;
const POLL_INTERVAL = 60_000;
const BOARD_INTERVAL = 30 * 60_000;

function start(discordClient) {
  client = discordClient;
  setInterval(pollAll, POLL_INTERVAL);
  setInterval(() => updateAllBoards(client), BOARD_INTERVAL);
  setInterval(() => updateAllHoursBoards(client), BOARD_INTERVAL);
  // Run the hours board once shortly after startup so the embed is fresh
  setTimeout(() => updateAllHoursBoards(client), 15_000);
  console.log('[Tracker] BattleMetrics player tracker started.');
}

async function pollAll() {
  if (!client) return;

  for (const guild of client.guilds.cache.values()) {
    try {
      const data = getGuildData(guild.id);
      if (!data.tracker || !data.tracker.tracked.length) continue;

      let changed = false;

      const wipeBoundary = getLastWipeBoundary(Date.now(), data.tracker.wipe);

      for (const entry of data.tracker.tracked) {
        try {
          const current = await getPlayerCurrentServer(entry.bmPlayerId);
          const currentId = current ? current.id : null;
          const filterId = entry.filterServerId || null;
          const wasOnline = entry.online;
          const nowOnline = filterId ? currentId === filterId : !!current;

          if (filterId) {
            const now = Date.now();
            if (entry.wipeStart !== wipeBoundary) {
              entry.wipeStart = wipeBoundary;
              entry.wipeMs = 0;
              entry.lastTickAt = nowOnline ? now : null;
              changed = true;
            } else if (nowOnline) {
              if (entry.lastTickAt) {
                const delta = now - entry.lastTickAt;
                if (delta > 0 && delta <= POLL_INTERVAL * 3) {
                  entry.wipeMs = (entry.wipeMs || 0) + delta;
                }
              }
              entry.lastTickAt = now;
              changed = true;
            } else if (entry.lastTickAt) {
              const delta = now - entry.lastTickAt;
              if (delta > 0 && delta <= POLL_INTERVAL * 3) {
                entry.wipeMs = (entry.wipeMs || 0) + delta;
              }
              entry.lastTickAt = null;
              changed = true;
            }
          }

          const stateChanged = wasOnline !== nowOnline || currentId !== entry.lastServerId;
          if (!stateChanged) continue;

          let embed = null;

          if (!wasOnline && nowOnline) {
            const serverName = filterId
              ? entry.filterServerName || (current && current.name) || 'the server'
              : current.name;
            const fields = [{ name: 'Server', value: serverName, inline: true }];
            if (current) fields.push({ name: 'Players', value: `${current.players}/${current.maxPlayers}`, inline: true });
            embed = new EmbedBuilder()
              .setColor(0x00c853)
              .setTitle('🟢 Player Online')
              .setDescription(filterId ? `**${entry.name}** just joined **${serverName}**.` : `**${entry.name}** just joined a server.`)
              .addFields(fields)
              .setTimestamp();
          } else if (wasOnline && !nowOnline) {
            const serverName = filterId
              ? entry.filterServerName || entry.lastServerName || 'the server'
              : entry.lastServerName || 'Unknown';
            embed = new EmbedBuilder()
              .setColor(0xff4444)
              .setTitle(filterId ? '🔴 Player Left' : '🔴 Player Offline')
              .setDescription(filterId ? `**${entry.name}** left **${serverName}**.` : `**${entry.name}** has gone offline.`)
              .addFields({ name: filterId ? 'Server' : 'Last Server', value: serverName, inline: true })
              .setTimestamp();
          } else if (!filterId && wasOnline && nowOnline && currentId !== entry.lastServerId) {
            embed = new EmbedBuilder()
              .setColor(GOLD)
              .setTitle('🔄 Player Switched Server')
              .setDescription(`**${entry.name}** moved to a new server.`)
              .addFields(
                { name: 'Now On', value: current.name, inline: true },
                { name: 'Players', value: `${current.players}/${current.maxPlayers}`, inline: true },
              )
              .setTimestamp();
          }

          changed = true;

          if (embed) {
            const alertChannel = guild.channels.cache.get(entry.alertChannelId);
            if (alertChannel) await alertChannel.send({ embeds: [embed] });
          }

          entry.online = nowOnline;
          entry.lastServerId = currentId;
          entry.lastServerName = current ? current.name : entry.lastServerName;
        } catch {}
      }

      if (changed) saveGuildData(guild.id, data);
    } catch {}
  }
}

module.exports = { start };

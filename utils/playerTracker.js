const { EmbedBuilder } = require('discord.js');
const { getPlayerCurrentServer } = require('./battlemetrics');
const { getGuildData, saveGuildData } = require('./storage');
const { GOLD } = require('../theme');

let client = null;
const POLL_INTERVAL = 60_000;

function start(discordClient) {
  client = discordClient;
  setInterval(pollAll, POLL_INTERVAL);
  console.log('[Tracker] BattleMetrics player tracker started.');
}

async function pollAll() {
  if (!client) return;

  for (const guild of client.guilds.cache.values()) {
    try {
      const data = getGuildData(guild.id);
      if (!data.tracker || !data.tracker.tracked.length) continue;

      let changed = false;

      for (const entry of data.tracker.tracked) {
        try {
          const current = await getPlayerCurrentServer(entry.bmPlayerId);
          const currentId = current ? current.id : null;
          const wasOnline = entry.online;
          const nowOnline = !!current;

          if (currentId === entry.lastServerId && wasOnline === nowOnline) continue;

          changed = true;
          const alertChannel = guild.channels.cache.get(entry.alertChannelId);
          if (!alertChannel) continue;

          let embed;

          if (!wasOnline && nowOnline) {
            embed = new EmbedBuilder()
              .setColor(0x00c853)
              .setTitle('🟢 Player Online')
              .setDescription(`**${entry.name}** just joined a server.`)
              .addFields(
                { name: 'Server', value: current.name, inline: true },
                { name: 'Players', value: `${current.players}/${current.maxPlayers}`, inline: true },
              )
              .setTimestamp();
          } else if (wasOnline && !nowOnline) {
            embed = new EmbedBuilder()
              .setColor(0xff4444)
              .setTitle('🔴 Player Offline')
              .setDescription(`**${entry.name}** has gone offline.`)
              .addFields({ name: 'Last Server', value: entry.lastServerName || 'Unknown', inline: true })
              .setTimestamp();
          } else if (wasOnline && nowOnline && currentId !== entry.lastServerId) {
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

          if (embed) await alertChannel.send({ embeds: [embed] });

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

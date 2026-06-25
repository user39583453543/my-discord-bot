const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { GOLD } = require('../theme');
const { getGuildData } = require('../utils/storage');
const { getLastWipeBoundary } = require('../utils/wipe');
const bm = require('../utils/battlemetrics');

const POLL_INTERVAL = 60_000;

function liveMs(entry, now, boundary) {
  if (entry.wipeStart !== boundary) return 0;
  let ms = entry.wipeMs || 0;
  if (entry.online && entry.lastTickAt) {
    const delta = now - entry.lastTickAt;
    if (delta > 0 && delta <= POLL_INTERVAL * 3) ms += delta;
  }
  return ms;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wipehours')
    .setDescription('Hours your tracked players have played since the last wipe')
    .addStringOption((opt) =>
      opt.setName('steam-id').setDescription('Show just one player (17-digit steamID64)').setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const data = getGuildData(interaction.guild.id);
    const tracked = (data.tracker.tracked || []).filter((t) => t.filterServerId);
    const now = Date.now();
    const boundary = getLastWipeBoundary(now, data.tracker.wipe);
    const wipeTag = `<t:${Math.floor(boundary / 1000)}:F>`;
    const fmtH = (ms) => (ms / 3_600_000).toFixed(1);

    if (!tracked.length) {
      return interaction.editReply('No players are being tracked on a specific server yet. Use `/bm bulktrack` with a server to start counting wipe hours.');
    }

    const steamId = interaction.options.getString('steam-id');
    if (steamId) {
      const id = steamId.trim();
      if (!/^\d{17}$/.test(id)) {
        return interaction.editReply('❌ That doesn\'t look like a valid Steam ID. Use the 17-digit steamID64.');
      }
      let player;
      try {
        player = await bm.getPlayerBySteamId(id);
      } catch {
        return interaction.editReply('❌ Failed to reach BattleMetrics API.');
      }
      if (!player) return interaction.editReply(`❌ No Rust player found for Steam ID \`${id}\`.`);
      const entry = tracked.find((t) => t.bmPlayerId === player.id);
      if (!entry) {
        return interaction.editReply(`**${player.attributes.name}** isn't being tracked on a server. Add them with \`/bm track\` (with a server) first.`);
      }
      const embed = new EmbedBuilder()
        .setColor(GOLD)
        .setTitle(`⏱️ Wipe Hours — ${entry.name}`)
        .setDescription(`On **${entry.filterServerName || 'the server'}** since the last wipe (${wipeTag})`)
        .addFields({
          name: 'Hours this wipe',
          value: `**${fmtH(liveMs(entry, now, boundary))} h** ${entry.online ? '· 🟢 online now' : ''}`,
          inline: false,
        })
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    const rows = tracked
      .map((t) => ({ name: t.name, ms: liveMs(t, now, boundary), online: t.online, server: t.filterServerName }))
      .sort((a, b) => b.ms - a.ms);

    const serverName = rows[0]?.server || 'the server';
    const embed = new EmbedBuilder()
      .setColor(GOLD)
      .setTitle('⏱️ Wipe Hours')
      .setDescription(`Hours played on **${serverName}** since the last wipe (${wipeTag}).\nCounted live by the bot — only includes time since tracking started.`)
      .setTimestamp();

    const lines = rows.map((r, i) => `**${i + 1}.** ${r.online ? '🟢' : '🔴'} ${r.name} — **${fmtH(r.ms)} h**`);
    let chunk = '';
    for (const line of lines) {
      if ((chunk + line + '\n').length > 1024) {
        embed.addFields({ name: '\u200b', value: chunk, inline: false });
        chunk = '';
      }
      chunk += line + '\n';
    }
    if (chunk) embed.addFields({ name: '\u200b', value: chunk, inline: false });

    return interaction.editReply({ embeds: [embed] });
  },
};

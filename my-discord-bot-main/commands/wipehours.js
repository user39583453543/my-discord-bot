const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { GOLD } = require('../theme');
const { getGuildData, saveGuildData } = require('../utils/storage');

const POLL_INTERVAL = 60_000;

function liveMs(entry, now) {
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
    .setDescription('Hours your tracked players have played')
    .addSubcommand((sub) =>
      sub.setName('show').setDescription('Show the current hours leaderboard')
    )
    .addSubcommand((sub) =>
      sub.setName('reset').setDescription('Reset everyone\'s hour counters back to 0')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const data = getGuildData(interaction.guild.id);
    const tracked = (data.tracker.tracked || []).filter((t) => t.filterServerId);
    const now = Date.now();
    const fmtH = (ms) => (ms / 3_600_000).toFixed(1);

    if (sub === 'reset') {
      for (const entry of data.tracker.tracked) {
        entry.wipeMs = 0;
        entry.lastTickAt = entry.online ? now : null;
      }
      saveGuildData(interaction.guild.id, data);
      return interaction.reply({ content: `✅ All hour counters reset to 0 for **${data.tracker.tracked.length}** players.`, flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply();

    if (!tracked.length) {
      return interaction.editReply('No players are being tracked on a specific server yet. Use `/bm bulktrack` with a server ID to start.');
    }

    const rows = tracked
      .map((t) => ({ name: t.name, discordName: t.discordName, ms: liveMs(t, now), online: t.online, server: t.filterServerName }))
      .sort((a, b) => b.ms - a.ms);

    const serverName = rows[0]?.server || 'the server';
    const embed = new EmbedBuilder()
      .setColor(GOLD)
      .setTitle('⏱️ Hours Leaderboard')
      .setDescription(`Hours played on **${serverName}**.\nUse \`/wipehours reset\` to reset all counters.`)
      .setTimestamp();

    const lines = rows.map((r, i) => {
      const label = r.discordName || r.name;
      return `**${i + 1}.** ${r.online ? '🟢' : '🔴'} ${label} — **${fmtH(r.ms)} h**`;
    });

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

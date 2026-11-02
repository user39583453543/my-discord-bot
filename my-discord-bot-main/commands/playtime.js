const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { GOLD } = require('../theme');
const { getGuildData } = require('../utils/storage');
const bm = require('../utils/battlemetrics');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('playtime')
    .setDescription('Show how many hours a player has on each Rust server')
    .addStringOption((opt) =>
      opt.setName('steam-id').setDescription('17-digit steamID64 (e.g. 76561198000000000)').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('server').setDescription('Only show hours on this server (name or BattleMetrics ID)').setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const steamId = interaction.options.getString('steam-id').trim();
    const data = getGuildData(interaction.guild.id);
    const serverFilter = interaction.options.getString('server') || data.tracker.playtimeServerId || null;

    if (!/^\d{17}$/.test(steamId)) {
      return interaction.editReply('❌ That doesn\'t look like a valid Steam ID. Use the 17-digit steamID64 (e.g. `76561198000000000`).');
    }

    let player;
    try {
      player = await bm.getPlayerBySteamId(steamId);
    } catch (err) {
      if (err.response?.status === 401) {
        return interaction.editReply('❌ A BattleMetrics API token is required. Set `BATTLEMETRICS_TOKEN` in your secrets.');
      }
      return interaction.editReply('❌ Failed to reach BattleMetrics API.');
    }

    if (!player) {
      return interaction.editReply(`❌ No Rust player found for Steam ID \`${steamId}\`.`);
    }

    let servers;
    try {
      servers = await bm.getPlayerServerPlaytime(player.id);
    } catch (err) {
      if (err.response?.status === 401) {
        return interaction.editReply('❌ A BattleMetrics API token is required. Set `BATTLEMETRICS_TOKEN` in your secrets.');
      }
      return interaction.editReply('❌ Failed to fetch playtime data.');
    }

    if (serverFilter) {
      const f = serverFilter.toLowerCase();
      servers = servers.filter((s) => s.id === serverFilter || (s.name && s.name.toLowerCase().includes(f)));
    }

    const top = servers.slice(0, serverFilter ? 10 : 8);
    await Promise.all(
      top.map(async (s) => {
        if (!s.name) {
          try {
            const sv = await bm.getServer(s.id);
            s.name = sv.attributes.name;
          } catch {
            s.name = `Server ${s.id}`;
          }
        }
      })
    );

    const fmtH = (sec) => (sec / 3600).toFixed(1);

    const embed = new EmbedBuilder()
      .setColor(GOLD)
      .setTitle(`⏱️ Playtime — ${player.attributes.name}`)
      .setURL(`https://www.battlemetrics.com/players/${player.id}`)
      .setTimestamp();

    if (!top.length) {
      embed.setDescription(
        serverFilter
          ? `No matching server found for **${player.attributes.name}** (filter: "${serverFilter}").`
          : 'No server playtime found for this player.'
      );
    } else {
      const totalSec = servers.reduce((acc, s) => acc + s.timePlayed, 0);
      embed.setDescription(`Steam ID: \`${steamId}\`\nTotal tracked playtime: **${fmtH(totalSec)} h**`);
      for (const s of top) {
        embed.addFields({
          name: `${s.online ? '🟢' : '🔴'} ${s.name}`,
          value: `**${fmtH(s.timePlayed)} hours** · Last seen: ${s.lastSeen ? `<t:${Math.floor(new Date(s.lastSeen).getTime() / 1000)}:R>` : 'Unknown'}`,
          inline: false,
        });
      }
    }

    return interaction.editReply({ embeds: [embed] });
  },
};

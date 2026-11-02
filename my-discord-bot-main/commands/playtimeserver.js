const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { GOLD } = require('../theme');
const { getGuildData, saveGuildData } = require('../utils/storage');
const bm = require('../utils/battlemetrics');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('playtimeserver')
    .setDescription('Set which server /playtime shows hours for by default')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt.setName('server-id').setDescription('BattleMetrics server ID (use /bm server to find it)').setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const serverId = interaction.options.getString('server-id').trim();
    const data = getGuildData(interaction.guild.id);

    let serverName = null;
    try {
      const sv = await bm.getServer(serverId);
      serverName = sv.attributes.name;
    } catch (err) {
      if (err.response?.status === 401) {
        return interaction.editReply('❌ A BattleMetrics API token is required. Set `BATTLEMETRICS_TOKEN` in your secrets.');
      }
      return interaction.editReply(`❌ Couldn't find a BattleMetrics server with ID \`${serverId}\`. Use \`/bm server\` to search for the correct ID.`);
    }

    data.tracker.playtimeServerId = serverId;
    data.tracker.playtimeServerName = serverName;
    saveGuildData(interaction.guild.id, data);

    const embed = new EmbedBuilder()
      .setColor(GOLD)
      .setTitle('✅ Default playtime server set')
      .setDescription(`\`/playtime\` will now show hours on **${serverName}** by default.\nServer ID: \`${serverId}\``)
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  },
};

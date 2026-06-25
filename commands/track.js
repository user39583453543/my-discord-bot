const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType,
} = require('discord.js');
const { getGuildData, saveGuildData } = require('../utils/storage');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('track')
    .setDescription('Add a player to the hours leaderboard by Steam ID')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt.setName('steam-id').setDescription('17-digit Steam ID (e.g. 76561198087694331)').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('name').setDescription('Name to show on the leaderboard').setRequired(true)
    )
    .addChannelOption((opt) =>
      opt.setName('channel')
        .setDescription('Alert channel (defaults to same as other tracked players)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName('server-id')
        .setDescription('BattleMetrics server ID to filter to (defaults to same as other tracked players)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const steamId = interaction.options.getString('steam-id').trim();
    const name = interaction.options.getString('name').trim();

    if (!/^\d{17}$/.test(steamId)) {
      return interaction.reply({
        content: '❌ That doesn\'t look like a valid Steam ID. It should be 17 digits, e.g. `76561198087694331`.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const data = getGuildData(interaction.guild.id);
    if (!data.tracker) data.tracker = { tracked: [] };

    // Check already tracked
    const existing = data.tracker.tracked.find((t) => t.steamId === steamId);
    if (existing) {
      return interaction.reply({
        content: `⚠️ **${existing.discordName || existing.name}** (\`${steamId}\`) is already on the leaderboard.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // Resolve channel and server from options or inherit from existing tracked players
    const existingEntry = data.tracker.tracked.find((t) => t.alertChannelId);
    const channelOption = interaction.options.getChannel('channel');
    const serverIdOption = interaction.options.getString('server-id');

    const alertChannelId = channelOption?.id || existingEntry?.alertChannelId || interaction.channel.id;
    const filterServerId = serverIdOption || existingEntry?.filterServerId || null;
    const filterServerName = filterServerId
      ? (serverIdOption ? `Server ${filterServerId}` : existingEntry?.filterServerName || null)
      : null;

    data.tracker.tracked.push({
      steamId,
      bmPlayerId: null,
      name,
      discordName: name,
      alertChannelId,
      filterServerId,
      filterServerName,
      lastServerId: null,
      lastServerName: null,
      online: false,
      addedBy: interaction.user.id,
    });

    saveGuildData(interaction.guild.id, data);

    const where = filterServerId ? ` · Server \`${filterServerId}\`` : '';
    const alertInfo = `Alerts → <#${alertChannelId}>${where}`;
    return interaction.reply({
      content: `✅ **${name}** (\`${steamId}\`) added to the leaderboard.\n${alertInfo}`,
      flags: MessageFlags.Ephemeral,
    });
  },
};

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getGuildData, saveGuildData } = require('../utils/storage');
const { buildRosterEmbed, buildLinkButtons } = require('../utils/rosterBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('links')
    .setDescription('Set the link buttons shown on the roster (Discord, Telegram, YouTube)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt.setName('discord').setDescription('Discord invite URL').setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName('telegram').setDescription('Telegram link URL').setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName('youtube').setDescription('YouTube channel URL').setRequired(false)
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const data = getGuildData(guildId);

    const discordUrl = interaction.options.getString('discord');
    const telegramUrl = interaction.options.getString('telegram');
    const youtubeUrl = interaction.options.getString('youtube');

    if (discordUrl) data.links.discord = discordUrl;
    if (telegramUrl) data.links.telegram = telegramUrl;
    if (youtubeUrl) data.links.youtube = youtubeUrl;

    saveGuildData(guildId, data);

    if (data.roster.messageId) {
      try {
        const channel = await interaction.client.channels.fetch(data.roster.channelId);
        const message = await channel.messages.fetch(data.roster.messageId);
        const embed = buildRosterEmbed(data);
        const components = buildLinkButtons(data);
        await message.edit({ embeds: [embed], components });
      } catch (err) {
        console.error('Failed to update roster buttons:', err);
      }
    }

    return interaction.reply({
      content: 'Links updated.',
      flags: MessageFlags.Ephemeral,
    });
  },
};

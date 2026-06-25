const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const { getGuildData, saveGuildData } = require('../utils/storage');
const { buildRosterEmbed, buildLinkButtons } = require('../utils/rosterBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roster')
    .setDescription('Manage the team roster embed')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName('setup').setDescription('Post a new roster embed in this channel')
        .addStringOption((opt) =>
          opt.setName('title').setDescription('Team/clan name shown in the roster title (e.g. "ROI TEAM")').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('add').setDescription('Add a member to the roster')
        .addUserOption((opt) => opt.setName('user').setDescription('The member to add').setRequired(true))
        .addStringOption((opt) => opt.setName('role').setDescription('Their role/position (e.g. CALLER, BUILDER, SUPPORT)').setRequired(true))
        .addStringOption((opt) => opt.setName('emoji').setDescription('Emoji shown before their name (e.g. a flag 🇬🇧)').setRequired(false))
    )
    .addSubcommand((sub) =>
      sub.setName('remove').setDescription('Remove a member from the roster')
        .addUserOption((opt) => opt.setName('user').setDescription('The member to remove').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub.setName('refresh').setDescription('Re-render the roster embed')
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const data = getGuildData(guildId);
    const sub = interaction.options.getSubcommand();

    if (sub === 'setup') {
      const title = interaction.options.getString('title');
      data.roster.title = title;
      data.roster.members = [];

      const embed = buildRosterEmbed(data);
      const components = buildLinkButtons(data);

      const message = await interaction.channel.send({ embeds: [embed], components });

      data.roster.messageId = message.id;
      data.roster.channelId = message.channelId;
      saveGuildData(guildId, data);

      return interaction.reply({
        content: `Roster created for **${title}**. Use \`/roster add\` to add members.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!data.roster.messageId) {
      return interaction.reply({
        content: 'No roster has been set up yet. Use `/roster setup` first.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'add') {
      const user = interaction.options.getUser('user');
      const role = interaction.options.getString('role');
      const emoji = interaction.options.getString('emoji') || null;

      data.roster.members = data.roster.members.filter((m) => m.userId !== user.id);
      data.roster.members.push({ userId: user.id, role, emoji });
      saveGuildData(guildId, data);

      await updateRosterMessage(interaction, data);

      return interaction.reply({
        content: `Added <@${user.id}> as **${role.toUpperCase()}**.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'remove') {
      const user = interaction.options.getUser('user');
      const before = data.roster.members.length;
      data.roster.members = data.roster.members.filter((m) => m.userId !== user.id);

      if (data.roster.members.length === before) {
        return interaction.reply({
          content: `<@${user.id}> wasn't found on the roster.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      saveGuildData(guildId, data);
      await updateRosterMessage(interaction, data);

      return interaction.reply({
        content: `Removed <@${user.id}> from the roster.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'refresh') {
      await updateRosterMessage(interaction, data);
      return interaction.reply({
        content: 'Roster refreshed.',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

async function updateRosterMessage(interaction, data) {
  try {
    const channel = await interaction.client.channels.fetch(data.roster.channelId);
    const message = await channel.messages.fetch(data.roster.messageId);
    const embed = buildRosterEmbed(data);
    const components = buildLinkButtons(data);
    await message.edit({ embeds: [embed], components });
  } catch (err) {
    console.error('Failed to update roster message:', err);
  }
}

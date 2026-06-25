const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const { getGuildData } = require('../utils/storage');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-add')
    .setDescription('Add a user to this ticket')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addUserOption((opt) =>
      opt.setName('user').setDescription('User to add').setRequired(true)
    ),

  async execute(interaction) {
    const channel = interaction.channel;
    const data = getGuildData(interaction.guild.id);

    if (!data.tickets.active[channel.id]) {
      return interaction.reply({
        content: 'This command can only be used inside a ticket channel.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const user = interaction.options.getUser('user');
    const member = interaction.options.getMember('user');

    if (!member) {
      return interaction.reply({ content: 'User not found in this server.', flags: MessageFlags.Ephemeral });
    }

    await channel.permissionOverwrites.edit(member, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true,
    });

    return interaction.reply({ content: `✅ Added ${user} to this ticket.` });
  },
};

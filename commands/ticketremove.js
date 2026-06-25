const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const { getGuildData } = require('../utils/storage');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-remove')
    .setDescription('Remove a user from this ticket')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addUserOption((opt) =>
      opt.setName('user').setDescription('User to remove').setRequired(true)
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

    const ticketInfo = data.tickets.active[channel.id];
    const user = interaction.options.getUser('user');
    const member = interaction.options.getMember('user');

    if (user.id === ticketInfo.userId) {
      return interaction.reply({
        content: "You can't remove the ticket opener.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!member) {
      return interaction.reply({ content: 'User not found in this server.', flags: MessageFlags.Ephemeral });
    }

    await channel.permissionOverwrites.edit(member, {
      ViewChannel: false,
    });

    return interaction.reply({ content: `✅ Removed ${user} from this ticket.` });
  },
};

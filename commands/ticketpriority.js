const { SlashCommandBuilder } = require('discord.js');
const { setTicketPriority } = require('../utils/ticketManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-priority')
    .setDescription('Manually set the priority of this ticket.')
    .addStringOption(opt =>
      opt.setName('level')
        .setDescription('Priority level')
        .setRequired(true)
        .addChoices(
          { name: '🔴 High Priority', value: 'high' },
          { name: '🟡 Low Priority', value: 'low' },
        )
    ),
  async execute(interaction) {
    return setTicketPriority(interaction);
  },
};

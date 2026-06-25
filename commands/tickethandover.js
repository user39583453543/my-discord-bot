const { SlashCommandBuilder } = require('discord.js');
const { handoverTicket } = require('../utils/ticketManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-handover')
    .setDescription('Hand this ticket over to another staff member.')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('The staff member to hand the ticket to')
        .setRequired(true)
    ),
  async execute(interaction) {
    return handoverTicket(interaction);
  },
};

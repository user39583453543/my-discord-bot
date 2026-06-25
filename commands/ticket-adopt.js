const { SlashCommandBuilder } = require('discord.js');
const { adoptTicket } = require('../utils/ticketManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-adopt')
    .setDescription('Re-register an orphaned ticket channel so it can be claimed/closed.')
    .addUserOption((opt) =>
      opt.setName('opener').setDescription('The user who opened this ticket').setRequired(true)
    ),
  async execute(interaction) {
    return adoptTicket(interaction);
  },
};

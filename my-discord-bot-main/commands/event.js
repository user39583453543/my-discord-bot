const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createEvent } = require('../utils/eventManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('event')
    .setDescription('Post an RSVP event with Accept/Decline/Late buttons')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt.setName('title').setDescription('Event title, e.g. "REACT OR DIE"').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('datetime').setDescription('Date & time, e.g. "Thursday 16 July 2026 17:00"').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('server').setDescription('Server name (optional)').setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName('description').setDescription('Extra details (use \\n for new lines, optional)').setRequired(false)
    ),

  async execute(interaction) {
    return createEvent(interaction);
  },
};

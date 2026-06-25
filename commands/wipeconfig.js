const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { GOLD } = require('../theme');
const { getGuildData, saveGuildData } = require('../utils/storage');
const { getLastWipeBoundary, WD_NAMES } = require('../utils/wipe');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wipeconfig')
    .setDescription('Set when the server wipes (used to reset wipe-hour counters)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addIntegerOption((opt) =>
      opt
        .setName('day')
        .setDescription('Day of the week the server wipes')
        .setRequired(true)
        .addChoices(
          { name: 'Monday', value: 1 },
          { name: 'Tuesday', value: 2 },
          { name: 'Wednesday', value: 3 },
          { name: 'Thursday', value: 4 },
          { name: 'Friday', value: 5 },
          { name: 'Saturday', value: 6 },
          { name: 'Sunday', value: 0 },
        )
    )
    .addIntegerOption((opt) =>
      opt.setName('hour').setDescription('Hour of the day (0-23, UK time)').setMinValue(0).setMaxValue(23).setRequired(true)
    ),

  async execute(interaction) {
    const day = interaction.options.getInteger('day');
    const hour = interaction.options.getInteger('hour');
    const data = getGuildData(interaction.guild.id);

    data.tracker.wipe = { dayOfWeek: day, hour, tz: 'Europe/London' };
    saveGuildData(interaction.guild.id, data);

    const boundary = getLastWipeBoundary(Date.now(), data.tracker.wipe);
    const hh = String(hour).padStart(2, '0');

    const embed = new EmbedBuilder()
      .setColor(GOLD)
      .setTitle('🗓️ Wipe schedule set')
      .setDescription(`Wipe hours will now reset every **${WD_NAMES[day]} at ${hh}:00 UK time**.`)
      .addFields({ name: 'Most recent wipe', value: `<t:${Math.floor(boundary / 1000)}:F>`, inline: false })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  },
};

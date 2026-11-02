const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Delete a number of recent messages from this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((opt) =>
      opt.setName('amount')
        .setDescription('How many messages to delete (1-100)')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),

  async execute(interaction) {
    const amount = interaction.options.getInteger('amount');

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      // bulkDelete only works on messages younger than 14 days;
      // { filterOld: true } silently skips ones that are too old instead of throwing.
      const deleted = await interaction.channel.bulkDelete(amount, true);

      const skipped = amount - deleted.size;
      let content = `✅ Deleted **${deleted.size}** message${deleted.size !== 1 ? 's' : ''}.`;
      if (skipped > 0) {
        content += `\n⚠️ ${skipped} message${skipped !== 1 ? 's were' : ' was'} skipped (older than 14 days — Discord won't allow bulk-deleting those).`;
      }

      return interaction.editReply({ content });
    } catch (error) {
      console.error('[Clear] Failed to delete messages:', error);
      return interaction.editReply({
        content: '❌ Something went wrong while deleting messages. Make sure I have the **Manage Messages** permission in this channel.',
      });
    }
  },
};

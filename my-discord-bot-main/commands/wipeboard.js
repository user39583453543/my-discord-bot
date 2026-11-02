const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getGuildData, saveGuildData } = require('../utils/storage');
const { buildBoardEmbed } = require('../utils/wipeBoard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wipeboard')
    .setDescription('Post a live wipe-hours leaderboard in this channel (auto-updates every 30 min)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName('post').setDescription('Post the live board in this channel')
    )
    .addSubcommand((sub) =>
      sub.setName('stop').setDescription('Stop auto-updating the live board')
    ),

  async execute(interaction) {
    const data = getGuildData(interaction.guild.id);
    const sub = interaction.options.getSubcommand();

    if (sub === 'stop') {
      data.tracker.wipeBoard = null;
      saveGuildData(interaction.guild.id, data);
      return interaction.reply({ content: '🛑 Live wipe-hours board stopped. The last message will stay but won\'t update anymore.', flags: MessageFlags.Ephemeral });
    }

    const embed = buildBoardEmbed(data, Date.now());
    const msg = await interaction.channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    data.tracker.wipeBoard = { channelId: interaction.channel.id, messageId: msg.id };
    saveGuildData(interaction.guild.id, data);
    return interaction.reply({ content: '✅ Live wipe-hours board posted. It will refresh automatically every 30 minutes.', flags: MessageFlags.Ephemeral });
  },
};

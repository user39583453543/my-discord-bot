const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Make the bot send a plain message')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt.setName('message').setDescription('The message to send (use \\n for new lines)').setRequired(true)
    )
    .addChannelOption((opt) =>
      opt.setName('channel').setDescription('Channel to send in (defaults to this channel)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    ),

  async execute(interaction) {
    const message = interaction.options.getString('message').replace(/\\n/g, '\n');
    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

    await targetChannel.send({ content: message });

    return interaction.reply({
      content: `Sent to ${targetChannel}.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};

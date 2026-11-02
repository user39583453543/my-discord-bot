const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType,
} = require('discord.js');
const { GOLD } = require('../theme');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Make the bot send a custom gold/black embed')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt.setName('description').setDescription('Main text (use \\n for new lines)').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('title').setDescription('Embed title (optional)').setRequired(false)
    )
    .addAttachmentOption((opt) =>
      opt.setName('image').setDescription('Image/GIF to show in the embed').setRequired(false)
    )
    .addAttachmentOption((opt) =>
      opt.setName('thumbnail').setDescription('Small thumbnail image (top right)').setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName('color').setDescription('Override color: gold (default) or black')
        .addChoices(
          { name: 'Gold', value: 'gold' },
          { name: 'Black', value: 'black' },
        )
        .setRequired(false)
    )
    .addChannelOption((opt) =>
      opt.setName('channel').setDescription('Channel to send in (defaults to this channel)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    ),

  async execute(interaction) {
    const description = interaction.options.getString('description').replace(/\\n/g, '\n');
    const title = interaction.options.getString('title');
    const image = interaction.options.getAttachment('image');
    const thumbnail = interaction.options.getAttachment('thumbnail');
    const colorChoice = interaction.options.getString('color');
    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

    const embed = new EmbedBuilder()
      .setColor(colorChoice === 'black' ? 0x000000 : GOLD)
      .setDescription(description);

    if (title) embed.setTitle(title);
    if (image) embed.setImage(image.url);
    if (thumbnail) embed.setThumbnail(thumbnail.url);

    await targetChannel.send({ embeds: [embed] });

    return interaction.reply({
      content: `Sent to ${targetChannel}.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};

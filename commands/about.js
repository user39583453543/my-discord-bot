const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { GOLD } = require('../theme');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('about')
    .setDescription('Post an "About Us" embed')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt.setName('title').setDescription('Title, e.g. "Our history and mission"').setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('description')
        .setDescription('Main body text (markdown supported, use \\n for new lines)')
        .setRequired(true)
    )
    .addAttachmentOption((opt) =>
      opt.setName('banner').setDescription('Banner image/GIF shown at the top').setRequired(false)
    )
    .addAttachmentOption((opt) =>
      opt.setName('thumbnail').setDescription('Small logo/thumbnail image').setRequired(false)
    ),

  async execute(interaction) {
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description').replace(/\\n/g, '\n');
    const banner = interaction.options.getAttachment('banner');
    const thumbnail = interaction.options.getAttachment('thumbnail');

    const embed = new EmbedBuilder()
      .setColor(GOLD)
      .setTitle(title)
      .setDescription(description);

    if (banner) embed.setImage(banner.url);
    if (thumbnail) embed.setThumbnail(thumbnail.url);

    await interaction.channel.send({ embeds: [embed] });

    return interaction.reply({
      content: 'Posted.',
      flags: MessageFlags.Ephemeral,
    });
  },
};

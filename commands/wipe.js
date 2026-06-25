const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { GOLD } = require('../theme');

const IMAGE_SLOTS = ['image1','image2','image3','image4','image5','image6','image7','image8','image9','image10'];

module.exports = {
  data: (() => {
    const cmd = new SlashCommandBuilder()
      .setName('wipe')
      .setDescription('Post a wipe summary / achievement embed')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addStringOption((opt) =>
        opt
          .setName('title')
          .setDescription('Title, e.g. "FEBRUARY FORCE WIPE - ATLAS US MONTHLY"')
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName('description')
          .setDescription('Summary text (markdown supported, use \\n for new lines)')
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName('stats')
          .setDescription('Optional stat lines, e.g. "Rockets: 12,000\\nWinnings: $2,000"')
          .setRequired(false)
      );

    for (const name of IMAGE_SLOTS) {
      cmd.addAttachmentOption((opt) =>
        opt.setName(name).setDescription('Image / screenshot').setRequired(false)
      );
    }

    return cmd;
  })(),

  async execute(interaction) {
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description').replace(/\\n/g, '\n');
    const stats = interaction.options.getString('stats');

    let fullDescription = description;
    if (stats) {
      fullDescription += `\n\n${stats.replace(/\\n/g, '\n')}`;
    }

    const embed = new EmbedBuilder()
      .setColor(GOLD)
      .setTitle(title)
      .setDescription(fullDescription);

    const images = IMAGE_SLOTS
      .map((name) => interaction.options.getAttachment(name))
      .filter(Boolean);

    if (images[0]) embed.setImage(images[0].url);

    const embedsToSend = [embed];

    for (let i = 1; i < images.length; i++) {
      embedsToSend.push(
        new EmbedBuilder().setColor(GOLD).setImage(images[i].url)
      );
    }

    await interaction.channel.send({ embeds: embedsToSend });

    return interaction.reply({
      content: 'Posted.',
      flags: MessageFlags.Ephemeral,
    });
  },
};

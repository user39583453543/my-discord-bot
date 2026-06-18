const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const { GOLD, DIVIDER } = require('../theme');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-setup')
    .setDescription('Post the ticket panel in this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt
        .setName('title')
        .setDescription('Panel title (default: Open a Ticket)')
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName('description')
        .setDescription('Panel description (use \\n for new lines)')
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName('categories')
        .setDescription('Comma-separated category names, e.g. "Support,Report,Appeal" (max 5)')
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName('banner')
        .setDescription('Image URL to show as the banner on the panel')
        .setRequired(false)
    ),

  async execute(interaction) {
    const title = interaction.options.getString('title') || 'Open a Ticket';
    const rawDesc = interaction.options.getString('description');
    const description = rawDesc
      ? rawDesc.replace(/\\n/g, '\n')
      : 'Click the button below to open a support ticket.\nOur staff will assist you as soon as possible.';

    const categoriesRaw = interaction.options.getString('categories');
    const categories = categoriesRaw
      ? categoriesRaw.split(',').map((c) => c.trim()).filter(Boolean).slice(0, 5)
      : [];

    const banner = interaction.options.getString('banner');

    const embed = new EmbedBuilder()
      .setColor(GOLD)
      .setTitle(`🎫 ${title.toUpperCase()}`)
      .setDescription(`\`${DIVIDER}\`\n\n${description}\n\n\`${DIVIDER}\``)
      .setFooter({ text: interaction.guild.name })
      .setTimestamp();

    if (banner) embed.setImage(banner);

    let components;
    if (categories.length > 0) {
      const buttons = categories.map((cat) =>
        new ButtonBuilder()
          .setCustomId(`ticket_open:${cat}`)
          .setLabel(cat)
          .setStyle(ButtonStyle.Primary)
      );
      const rows = [];
      for (let i = 0; i < buttons.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
      }
      components = rows;
    } else {
      components = [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('ticket_open')
            .setLabel('Open a Ticket')
            .setEmoji('🎫')
            .setStyle(ButtonStyle.Primary)
        ),
      ];
    }

    await interaction.channel.send({ embeds: [embed], components });

    return interaction.reply({
      content: '✅ Ticket panel posted.',
      flags: MessageFlags.Ephemeral,
    });
  },
};

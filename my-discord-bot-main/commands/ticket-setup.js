const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const { DIVIDER } = require('../theme');

const COLORS = { red: 0xE02424, gold: 0xD4AF37, black: 0x000000, autumn: 0xC2703C };
const BANNER_SLOTS = ['banner1', 'banner2', 'banner3', 'banner4', 'banner5'];

// "Name|Description|Requirements|ButtonLabel" per category, categories separated by ";;"
// A category with just a name (no "|") falls back to a simple button with no section text.
function parseCategories(raw) {
  if (!raw) return [];
  return raw
    .split(';;')
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((chunk) => {
      const parts = chunk.split('|').map((p) => p.trim());
      const [name, description, requirements, buttonLabel] = parts;
      return {
        name: (name || 'Category').slice(0, 80),
        description: description || null,
        requirements: requirements || null,
        buttonLabel: (buttonLabel || 'Submit Application').slice(0, 80),
      };
    });
}

module.exports = {
  data: (() => {
    const cmd = new SlashCommandBuilder()
      .setName('ticket-setup')
      .setDescription('Post the ticket panel in this channel')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addStringOption((opt) =>
        opt.setName('title').setDescription('Panel title (default: Ticket System)').setRequired(false)
      )
      .addStringOption((opt) =>
        opt.setName('description').setDescription('Intro text under the title (use \\n for new lines)').setRequired(false)
      )
      .addStringOption((opt) =>
        opt.setName('categories')
          .setDescription('Name|Description|Requirements per category, separated by ;; — or just Name for a plain button')
          .setRequired(false)
      )
      .addStringOption((opt) =>
        opt.setName('color').setDescription('Accent color (default: red)')
          .addChoices(
            { name: 'Red', value: 'red' },
            { name: 'Gold', value: 'gold' },
            { name: 'Black', value: 'black' },
            { name: 'Autumn', value: 'autumn' },
          )
          .setRequired(false)
      )
      .addStringOption((opt) =>
        opt.setName('banner').setDescription('Image URL shown at the very top of the panel').setRequired(false)
      );

    BANNER_SLOTS.forEach((slot, i) => {
      cmd.addAttachmentOption((opt) =>
        opt.setName(slot).setDescription(`Banner image for category #${i + 1} (in the order you listed them)`).setRequired(false)
      );
    });

    return cmd;
  })(),

  async execute(interaction) {
    const title = interaction.options.getString('title') || 'Ticket System';
    const rawDesc = interaction.options.getString('description');
    const description = rawDesc
      ? rawDesc.replace(/\\n/g, '\n')
      : 'Welcome to our ticket system!\nClick the button that matches your goal below:';

    const colorChoice = interaction.options.getString('color') || 'red';
    const accent = COLORS[colorChoice] ?? COLORS.red;
    const topBanner = interaction.options.getString('banner');
    const categories = parseCategories(interaction.options.getString('categories'));

    const embeds = [];
    const headerEmbed = new EmbedBuilder()
      .setColor(accent)
      .setTitle(`📋 ${title.toUpperCase()}`)
      .setDescription(`\`${DIVIDER}\`\n\n${description}\n\n\`${DIVIDER}\``)
      .setFooter({ text: interaction.guild.name })
      .setTimestamp();
    if (topBanner) headerEmbed.setImage(topBanner);
    embeds.push(headerEmbed);

    const buttons = [];

    if (categories.length > 0) {
      categories.forEach((cat, i) => {
        const bannerAttachment = interaction.options.getAttachment(BANNER_SLOTS[i]);
        if (bannerAttachment) {
          embeds.push(new EmbedBuilder().setColor(accent).setImage(bannerAttachment.url));
        }

        if (cat.description || cat.requirements) {
          const lines = [`**» ${cat.name}**`];
          if (cat.description) lines.push(`• ${cat.description}`);
          if (cat.requirements) lines.push(`🚩 ${cat.requirements}`);
          embeds.push(new EmbedBuilder().setColor(accent).setDescription(lines.join('\n')));
        }

        buttons.push(
          new ButtonBuilder()
            .setCustomId(`ticket_open:${cat.name}`)
            .setLabel(cat.buttonLabel)
            .setEmoji('🚩')
            .setStyle(ButtonStyle.Secondary)
        );
      });
    } else {
      buttons.push(
        new ButtonBuilder()
          .setCustomId('ticket_open')
          .setLabel('Open a Ticket')
          .setEmoji('🎫')
          .setStyle(ButtonStyle.Danger)
      );
    }

    if (embeds.length > 10) {
      return interaction.reply({
        content: '❌ Too many sections — Discord allows a maximum of 10 embeds per message. Use fewer categories or banners.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) {
      rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }

    await interaction.channel.send({ embeds, components: rows });

    return interaction.reply({ content: '✅ Ticket panel posted.', flags: MessageFlags.Ephemeral });
  },
};

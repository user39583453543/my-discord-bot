const path = require('path');
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  AttachmentBuilder,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const cfg = require('../ticketPanel.config');
const { getGuildData } = require('../utils/storage');
const { DEFAULT_WIPE, getLastWipeBoundary } = require('../utils/wipe');

const ASSETS = path.join(__dirname, '..', 'assets', 'ticket-panel');
const FAQ_ID = 'ticket_faq';

const img = (file) =>
  new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${file}`));
const text = (content) => new TextDisplayBuilder().setContent(content);
const sep = (size = SeparatorSpacingSize.Large) => new SeparatorBuilder().setDivider(true).setSpacing(size);

// Same custom_id format the existing panel uses, so the questions per category keep working.
function openButton(cat) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_open:${cat.category}`)
      .setLabel(cat.button.label)
      .setEmoji(cat.button.emoji)
      .setStyle(ButtonStyle[cat.button.style] ?? ButtonStyle.Secondary),
  );
}

function addCategory(container, cat) {
  container
    .addSeparatorComponents(sep())
    .addMediaGalleryComponents(img(cat.image))
    .addTextDisplayComponents(text(cat.hint ? `${cat.text}\n-# ${cat.hint}` : cat.text));
  if (cat.requirementsImage) container.addMediaGalleryComponents(img(cat.requirementsImage));
  container.addActionRowComponents(openButton(cat));
}

function buildPanel() {
  const { support, partner, join } = cfg.categories;

  const container = new ContainerBuilder()
    .setAccentColor(cfg.accentColor)
    .addMediaGalleryComponents(img('rise-banner.png'))
    .addTextDisplayComponents(text(
      '## 🎫 Open a Ticket\n' +
      'Pick the option that matches what you need. A private channel will be opened between you and the RISE team.\n' +
      '> **Before you open one**\n' +
      cfg.checklist.map((line) => `> ✅ ${line}`).join('\n'),
    ));

  addCategory(container, support);
  addCategory(container, partner);
  addCategory(container, join);

  if (cfg.faq.length) {
    container
      .addSeparatorComponents(sep())
      .addTextDisplayComponents(text('### ❓ Quick Answers\n-# Most questions are answered here. Only you can see the reply.'))
      .addActionRowComponents(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(FAQ_ID)
          .setPlaceholder('Pick a question…')
          .addOptions(cfg.faq.slice(0, 25).map(({ value, emoji, label }) => ({ value, label, ...(emoji && { emoji: { name: emoji } }) }))),
      ));
  }

  return container
    .addSeparatorComponents(sep(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(text(`-# ${cfg.footer}`));
}

function panelFiles() {
  const { support, partner, join } = cfg.categories;
  const names = new Set(['rise-banner.png', support.image, partner.image, join.image, join.requirementsImage].filter(Boolean));
  return [...names].map((name) => new AttachmentBuilder(path.join(ASSETS, name), { name }));
}

function wipeAnswer(guildId) {
  const wipeCfg = getGuildData(guildId).tracker?.wipe || DEFAULT_WIPE;
  // Last wipe boundary one week from now = the next wipe after now (handles clock changes).
  const next = Math.floor(getLastWipeBoundary(Date.now() + 7 * 24 * 60 * 60 * 1000, wipeCfg) / 1000);
  return `**🗓️ Next wipe**\n<t:${next}:F> (<t:${next}:R>)`;
}

// Called from index.js when someone picks a Quick Answer.
async function handleFaqSelect(interaction) {
  const item = cfg.faq.find((f) => f.value === interaction.values[0]);
  const content = !item
    ? 'That answer is no longer available.'
    : item.answer === 'WIPE'
      ? wipeAnswer(interaction.guildId)
      : item.answer;
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

module.exports = {
  FAQ_ID,
  handleFaqSelect,

  data: new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('Post the RISE ticket panel (new design) in this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.channel.send({
      components: [buildPanel()],
      files: panelFiles(),
      flags: MessageFlags.IsComponentsV2,
    });
    return interaction.editReply({ content: '✅ Ticket panel posted. You can delete the old one.' });
  },
};

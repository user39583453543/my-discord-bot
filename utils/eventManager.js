const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const { GOLD } = require('../theme');
const { getGuildData, saveGuildData } = require('./storage');

function ensureEvents(data) {
  if (!data.events) data.events = {};
  return data.events;
}

function canManage(interaction, event) {
  if (interaction.user.id === event.createdBy) return true;
  return interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

function formatList(entries) {
  if (!entries.length) return '—';
  return entries.map((e) => `<@${e.id}>`).join('\n');
}

function buildEventEmbed(event) {
  const embed = new EmbedBuilder()
    .setColor(GOLD)
    .setTitle(event.title)
    .addFields(
      { name: 'Date & Time', value: event.dateTime, inline: false },
      { name: '\u200b', value: `🗺️ Server: ${event.server || '—'}`, inline: false },
      { name: `✅ Accepted (${event.accepted.length})`, value: formatList(event.accepted), inline: true },
      { name: `❌ Declined (${event.declined.length})`, value: formatList(event.declined), inline: true },
      { name: `🕒 Late (${event.late.length})`, value: formatList(event.late), inline: true },
    )
    .setFooter({ text: `Created by: ${event.createdByTag}` })
    .setTimestamp(event.createdAt);

  if (event.description) {
    embed.setDescription(event.description);
  }

  return embed;
}

function buildEventButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('event_accept').setLabel('Accept').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('event_decline').setLabel('Decline').setEmoji('❌').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('event_late').setLabel('Late').setEmoji('🕒').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('event_edit').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('event_reset').setEmoji('🔄').setStyle(ButtonStyle.Primary),
    ),
  ];
}

async function createEvent(interaction) {
  const title = interaction.options.getString('title');
  const dateTime = interaction.options.getString('datetime');
  const description = interaction.options.getString('description')?.replace(/\\n/g, '\n') || null;
  const server = interaction.options.getString('server') || null;

  const event = {
    title,
    dateTime,
    description,
    server,
    createdBy: interaction.user.id,
    createdByTag: interaction.user.tag,
    createdAt: new Date(),
    accepted: [],
    declined: [],
    late: [],
  };

  const embed = buildEventEmbed(event);
  const components = buildEventButtons();
  const message = await interaction.channel.send({ embeds: [embed], components });

  const data = getGuildData(interaction.guild.id);
  const events = ensureEvents(data);
  events[message.id] = event;
  saveGuildData(interaction.guild.id, data);

  return interaction.reply({ content: '✅ Event posted.', flags: MessageFlags.Ephemeral });
}

async function handleRsvp(interaction, status) {
  const data = getGuildData(interaction.guild.id);
  const events = ensureEvents(data);
  const event = events[interaction.message.id];
  if (!event) {
    return interaction.reply({ content: '❌ This event no longer exists.', flags: MessageFlags.Ephemeral });
  }

  const userId = interaction.user.id;
  event.accepted = event.accepted.filter((e) => e.id !== userId);
  event.declined = event.declined.filter((e) => e.id !== userId);
  event.late = event.late.filter((e) => e.id !== userId);
  event[status].push({ id: userId });

  saveGuildData(interaction.guild.id, data);

  await interaction.update({ embeds: [buildEventEmbed(event)], components: buildEventButtons() });
}

async function showEditModal(interaction) {
  const data = getGuildData(interaction.guild.id);
  const events = ensureEvents(data);
  const event = events[interaction.message.id];
  if (!event) {
    return interaction.reply({ content: '❌ This event no longer exists.', flags: MessageFlags.Ephemeral });
  }
  if (!canManage(interaction, event)) {
    return interaction.reply({ content: '❌ Only the event creator or staff can edit this.', flags: MessageFlags.Ephemeral });
  }

  const modal = new ModalBuilder()
    .setCustomId(`event_edit_modal:${interaction.message.id}`)
    .setTitle('Edit Event');

  const titleInput = new TextInputBuilder()
    .setCustomId('title').setLabel('Title').setStyle(TextInputStyle.Short)
    .setValue(event.title).setRequired(true);
  const dateTimeInput = new TextInputBuilder()
    .setCustomId('datetime').setLabel('Date & Time').setStyle(TextInputStyle.Short)
    .setValue(event.dateTime).setRequired(true);
  const serverInput = new TextInputBuilder()
    .setCustomId('server').setLabel('Server').setStyle(TextInputStyle.Short)
    .setValue(event.server || '').setRequired(false);
  const descInput = new TextInputBuilder()
    .setCustomId('description').setLabel('Description').setStyle(TextInputStyle.Paragraph)
    .setValue(event.description || '').setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(dateTimeInput),
    new ActionRowBuilder().addComponents(serverInput),
    new ActionRowBuilder().addComponents(descInput),
  );

  return interaction.showModal(modal);
}

async function handleEditModalSubmit(interaction) {
  const messageId = interaction.customId.split(':')[1];
  const data = getGuildData(interaction.guild.id);
  const events = ensureEvents(data);
  const event = events[messageId];
  if (!event) {
    return interaction.reply({ content: '❌ This event no longer exists.', flags: MessageFlags.Ephemeral });
  }

  event.title = interaction.fields.getTextInputValue('title');
  event.dateTime = interaction.fields.getTextInputValue('datetime');
  event.server = interaction.fields.getTextInputValue('server') || null;
  event.description = interaction.fields.getTextInputValue('description') || null;

  saveGuildData(interaction.guild.id, data);

  try {
    const message = await interaction.channel.messages.fetch(messageId);
    await message.edit({ embeds: [buildEventEmbed(event)], components: buildEventButtons() });
  } catch (err) {
    console.error('[Event] Failed to update message after edit:', err);
  }

  return interaction.reply({ content: '✅ Event updated.', flags: MessageFlags.Ephemeral });
}

async function resetEvent(interaction) {
  const data = getGuildData(interaction.guild.id);
  const events = ensureEvents(data);
  const event = events[interaction.message.id];
  if (!event) {
    return interaction.reply({ content: '❌ This event no longer exists.', flags: MessageFlags.Ephemeral });
  }
  if (!canManage(interaction, event)) {
    return interaction.reply({ content: '❌ Only the event creator or staff can reset this.', flags: MessageFlags.Ephemeral });
  }

  event.accepted = [];
  event.declined = [];
  event.late = [];
  saveGuildData(interaction.guild.id, data);

  await interaction.update({ embeds: [buildEventEmbed(event)], components: buildEventButtons() });
}

module.exports = {
  createEvent,
  handleRsvp,
  showEditModal,
  handleEditModalSubmit,
  resetEvent,
};

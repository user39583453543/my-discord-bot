const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const { GOLD } = require('../theme');
const { getGuildData, saveGuildData } = require('./storage');
const { generateTranscript } = require('./transcript');

const DEFAULT_QUESTIONS = [
  { label: 'Please describe your issue', placeholder: 'Give us as much detail as possible…', paragraph: true },
];

function ticketNumber(n) {
  return String(n).padStart(4, '0');
}

function buildTicketEmbed(ticketInfo, guildName) {
  const embed = new EmbedBuilder()
    .setColor(GOLD)
    .setTitle(`🎫 TICKET #${ticketNumber(ticketInfo.ticketNumber)}`)
    .setDescription(`<@${ticketInfo.userId}> · ${ticketInfo.category || 'General'}`)
    .setFooter({ text: `${guildName} · Ticket System` })
    .setTimestamp();

  if (ticketInfo.answers && ticketInfo.answers.length > 0) {
    for (const { question, answer } of ticketInfo.answers) {
      embed.addFields({ name: question, value: answer || '_No answer provided_', inline: false });
    }
  }

  embed.addFields(
    {
      name: 'Opened',
      value: `<t:${Math.floor(new Date(ticketInfo.openedAt).getTime() / 1000)}:R>`,
      inline: true,
    },
    {
      name: 'Status',
      value: ticketInfo.claimedBy ? `Claimed by <@${ticketInfo.claimedBy}>` : 'Waiting for staff',
      inline: true,
    },
  );

  return embed;
}

function buildTicketButtons(claimed = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_claim')
      .setLabel(claimed ? 'Claimed' : 'Claim')
      .setEmoji('🙋')
      .setStyle(claimed ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(claimed),
    new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel('Close Ticket')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger),
  );
}


async function showTicketModal(interaction, category) {
  const data = getGuildData(interaction.guild.id);
  const questions = data.tickets.config.questions.length
    ? data.tickets.config.questions
    : DEFAULT_QUESTIONS;

  const modal = new ModalBuilder()
    .setCustomId(category ? `ticket_modal:${category}` : 'ticket_modal')
    .setTitle('Submit your ticket');

  for (let i = 0; i < Math.min(questions.length, 5); i++) {
    const q = questions[i];
    const input = new TextInputBuilder()
      .setCustomId(`q${i}`)
      .setLabel(q.label.slice(0, 45))
      .setStyle(q.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(true);
    if (q.placeholder) input.setPlaceholder(q.placeholder.slice(0, 100));
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }

  return interaction.showModal(modal);
}

async function handleModalSubmit(interaction) {
  const guild = interaction.guild;
  const user = interaction.user;
  const guildId = guild.id;
  const data = getGuildData(guildId);
  const cfg = data.tickets.config;

  const category = interaction.customId.includes(':')
    ? interaction.customId.split(':').slice(1).join(':')
    : null;

  const existingEntry = Object.entries(data.tickets.active).find(
    ([, t]) => t.userId === user.id
  );
  if (existingEntry) {
    const [channelId] = existingEntry;
    return interaction.reply({
      content: `You already have an open ticket: <#${channelId}>`,
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const questions = cfg.questions.length ? cfg.questions : DEFAULT_QUESTIONS;
  const answers = questions.slice(0, 5).map((q, i) => ({
    question: q.label,
    answer: interaction.fields.getTextInputValue(`q${i}`) || '',
  }));

  cfg.counter = (cfg.counter || 0) + 1;
  const num = cfg.counter;
  const channelName = `ticket-${ticketNumber(num)}`;

  const permissionOverwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    },
  ];

  if (cfg.staffRoleId) {
    permissionOverwrites.push({
      id: cfg.staffRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }

  const channelOptions = {
    name: channelName,
    type: ChannelType.GuildText,
    topic: `Ticket #${ticketNumber(num)} | ${user.tag} | ${category || 'General'}`,
    permissionOverwrites,
  };
  if (cfg.categoryId) channelOptions.parent = cfg.categoryId;

  let ticketChannel;
  try {
    ticketChannel = await guild.channels.create(channelOptions);
  } catch (err) {
    console.error('Failed to create ticket channel:', err);
    return interaction.editReply({ content: 'Failed to create ticket channel. Check my permissions.' });
  }

  const ticketInfo = {
    ticketNumber: num,
    userId: user.id,
    openerTag: user.tag,
    claimedBy: null,
    claimedByTag: null,
    openedAt: new Date().toISOString(),
    category: category || 'General',
    answers,
    panelMsgId: null,
  };

  data.tickets.active[ticketChannel.id] = ticketInfo;
  saveGuildData(guildId, data);

  const embed = buildTicketEmbed(ticketInfo, guild.name);
  const row = buildTicketButtons(false);

  const pingContent = cfg.staffRoleId
    ? `<@${user.id}> | <@&${cfg.staffRoleId}>`
    : `<@${user.id}>`;

  const panelMsg = await ticketChannel.send({ content: pingContent, embeds: [embed], components: [row] });

  data.tickets.active[ticketChannel.id].panelMsgId = panelMsg.id;
  saveGuildData(guildId, data);

  return interaction.editReply({ content: `✅ Your ticket has been created: ${ticketChannel}` });
}

async function claimTicket(interaction) {
  const channel = interaction.channel;
  const guild = interaction.guild;
  const data = getGuildData(guild.id);
  const ticketInfo = data.tickets.active[channel.id];

  if (!ticketInfo) {
    return interaction.reply({ content: 'This is not a ticket channel.', flags: MessageFlags.Ephemeral });
  }
  if (ticketInfo.claimedBy) {
    return interaction.reply({
      content: `Already claimed by <@${ticketInfo.claimedBy}>.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  ticketInfo.claimedBy = interaction.user.id;
  ticketInfo.claimedByTag = interaction.user.tag;
  saveGuildData(guild.id, data);

  const embed = buildTicketEmbed(ticketInfo, guild.name);
  const row = buildTicketButtons(true);

  if (ticketInfo.panelMsgId) {
    try {
      const panelMsg = await channel.messages.fetch(ticketInfo.panelMsgId);
      await panelMsg.edit({ embeds: [embed], components: [row] });
    } catch {}
  }

  return interaction.reply({ content: `✅ <@${interaction.user.id}> has claimed this ticket.` });
}

async function closeTicket(interaction) {
  const channel = interaction.channel;
  const data = getGuildData(interaction.guild.id);

  if (!data.tickets.active[channel.id]) {
    return interaction.reply({ content: 'This is not a ticket channel.', flags: MessageFlags.Ephemeral });
  }

  const modal = new ModalBuilder()
    .setCustomId('ticket_close_modal')
    .setTitle('Close Ticket');

  const reasonInput = new TextInputBuilder()
    .setCustomId('close_reason')
    .setLabel('Reason for closing')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('e.g. Issue resolved, No response, Does not meet requirements…')
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
  return interaction.showModal(modal);
}

async function handleCloseModal(interaction) {
  const channel = interaction.channel;
  const guild = interaction.guild;
  const data = getGuildData(guild.id);
  const ticketInfo = data.tickets.active[channel.id];

  if (!ticketInfo) {
    return interaction.reply({ content: 'This is not a ticket channel.', flags: MessageFlags.Ephemeral });
  }

  const reason = interaction.fields.getTextInputValue('close_reason');

  await interaction.reply({ content: '📋 Saving transcript and closing…', flags: MessageFlags.Ephemeral });

  let transcriptFile;
  try {
    transcriptFile = await generateTranscript(channel, ticketInfo);
  } catch (err) {
    console.error('Transcript error:', err);
  }

  const cfg = data.tickets.config;
  if (cfg.logChannelId) {
    try {
      const logChannel = await guild.channels.fetch(cfg.logChannelId);
      const logEmbed = new EmbedBuilder()
        .setColor(GOLD)
        .setTitle(`📋 Ticket #${ticketNumber(ticketInfo.ticketNumber)} Closed`)
        .addFields(
          { name: 'Opened By', value: `<@${ticketInfo.userId}>`, inline: true },
          { name: 'Category', value: ticketInfo.category || 'General', inline: true },
          { name: 'Closed By', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Claimed By', value: ticketInfo.claimedBy ? `<@${ticketInfo.claimedBy}>` : 'Unclaimed', inline: true },
          { name: 'Opened', value: `<t:${Math.floor(new Date(ticketInfo.openedAt).getTime() / 1000)}:F>`, inline: true },
          { name: 'Close Reason', value: reason, inline: false },
        )
        .setTimestamp();
      const sendOptions = { embeds: [logEmbed] };
      if (transcriptFile) sendOptions.files = [transcriptFile];
      await logChannel.send(sendOptions);
    } catch (err) {
      console.error('Failed to send to log channel:', err);
    }
  }

  delete data.tickets.active[channel.id];
  saveGuildData(guild.id, data);

  try {
    const member = await guild.members.fetch(ticketInfo.userId);
    const dmEmbed = new EmbedBuilder()
      .setColor(0xff4444)
      .setTitle('🎫 Your ticket has been closed')
      .setDescription(`Your ticket **#${ticketNumber(ticketInfo.ticketNumber)}** in **${guild.name}** has been closed.`)
      .addFields(
        { name: 'Closed By', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Reason', value: reason, inline: false },
      )
      .setTimestamp();
    await member.send({ embeds: [dmEmbed] }).catch(() => {});
  } catch {}

  setTimeout(async () => { try { await channel.delete(); } catch {} }, 3000);
}

module.exports = { showTicketModal, handleModalSubmit, claimTicket, closeTicket, handleCloseModal };

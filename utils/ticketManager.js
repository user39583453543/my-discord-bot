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

function getPriority(answers) {
  const text = answers.map(a => a.answer).join(' ').toLowerCase();
  if (/\bvouch(ed|es|ing)?\b/.test(text)) return 'high';
  return 'low';
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

  const priorityLabel = ticketInfo.priority === 'high' ? '🔴 High Priority' : '🟡 Low Priority';

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
    {
      name: 'Priority',
      value: priorityLabel,
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
    new ButtonBuilder()
      .setCustomId('ticket_accept')
      .setLabel('Accept')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('ticket_decline')
      .setLabel('Decline')
      .setEmoji('🚫')
      .setStyle(ButtonStyle.Danger),
  );
}


async function showTicketModal(interaction, category) {
  const data = getGuildData(interaction.guild.id);
  const cfg = data.tickets.config;

  if (cfg.declinedRoleId) {
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (member && member.roles.cache.has(cfg.declinedRoleId)) {
      return interaction.reply({
        content: '❌ You are not permitted to open a ticket.',
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  const questions = cfg.questions.length
    ? cfg.questions
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

  return interaction.showModal(modal).catch(() => {});
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
  const priority = getPriority(answers);
  const channelName = priority === 'high'
    ? `high-prio-${ticketNumber(num)}`
    : `low-prio-${ticketNumber(num)}`;

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
    priority,
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
  const cfg = data.tickets.config;

  if (ticketInfo && interaction.user.id === ticketInfo.userId) {
    return interaction.reply({
      content: '❌ You cannot claim your own ticket.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  const isStaff = cfg.staffRoleId
    ? member && member.roles.cache.has(cfg.staffRoleId)
    : member && member.permissions.has('Administrator');
  if (!isStaff) {
    return interaction.reply({
      content: '❌ Only staff can claim tickets.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (ticketInfo) {
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
  }

  return interaction.reply({ content: `✅ <@${interaction.user.id}> has claimed this ticket.` });
}

async function closeTicket(interaction) {
  const channel = interaction.channel;
  const data = getGuildData(interaction.guild.id);
  const ticketInfo = data.tickets.active[channel.id];
  const cfg = data.tickets.config;

  if (ticketInfo && interaction.user.id === ticketInfo.userId) {
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const isStaff = cfg.staffRoleId
      ? member && member.roles.cache.has(cfg.staffRoleId)
      : member && member.permissions.has('Administrator');
    if (!isStaff) {
      return interaction.reply({
        content: '❌ You cannot close your own ticket.',
        flags: MessageFlags.Ephemeral,
      });
    }
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
  const reason = interaction.fields.getTextInputValue('close_reason');

  await interaction.reply({ content: '📋 Saving transcript and closing…', flags: MessageFlags.Ephemeral });

  if (ticketInfo) {
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
  }

  setTimeout(async () => { try { await channel.delete(); } catch {} }, 3000);
}

async function handoverTicket(interaction) {
  const channel = interaction.channel;
  const guild = interaction.guild;
  const data = getGuildData(guild.id);
  const ticketInfo = data.tickets.active[channel.id];
  const cfg = data.tickets.config;
  const target = interaction.options.getUser('user');

  await interaction.deferReply();

  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  const isStaff = cfg.staffRoleId
    ? member && member.roles.cache.has(cfg.staffRoleId)
    : member && member.permissions.has('Administrator');
  if (!isStaff) {
    return interaction.editReply({ content: '❌ Only staff can hand over tickets.' });
  }

  const targetMember = await guild.members.fetch(target.id).catch(() => null);
  if (!targetMember) {
    return interaction.editReply({ content: '❌ Could not find that user in this server.' });
  }

  await channel.permissionOverwrites.edit(target.id, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    AttachFiles: true,
  }).catch(() => {});

  if (ticketInfo) {
    ticketInfo.claimedBy = target.id;
    ticketInfo.claimedByTag = target.tag;
    saveGuildData(guild.id, data);
    const embed = buildTicketEmbed(ticketInfo, guild.name);
    const row = buildTicketButtons(true);
    if (ticketInfo.panelMsgId) {
      try {
        const panelMsg = await channel.messages.fetch(ticketInfo.panelMsgId);
        await panelMsg.edit({ embeds: [embed], components: [row] });
      } catch {}
    }
  }

  return interaction.editReply({
    content: `🔁 Ticket handed over to <@${target.id}> by <@${interaction.user.id}>.`,
  });
}

async function setTicketPriority(interaction) {
  const channel = interaction.channel;
  const guild = interaction.guild;
  const data = getGuildData(guild.id);
  const ticketInfo = data.tickets.active[channel.id];
  const cfg = data.tickets.config;

  const level = interaction.options.getString('level');

  await interaction.deferReply();

  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  const isStaff = cfg.staffRoleId
    ? member && member.roles.cache.has(cfg.staffRoleId)
    : member && member.permissions.has('Administrator');
  if (!isStaff) {
    return interaction.editReply({ content: '❌ Only staff can change ticket priority.' });
  }

  const numMatch = channel.name.match(/(\d+)$/);
  const num = numMatch ? numMatch[1] : '0000';
  const newName = level === 'high' ? `high-prio-${num}` : `low-prio-${num}`;
  await channel.setName(newName).catch(() => {});

  if (ticketInfo) {
    ticketInfo.priority = level;
    saveGuildData(guild.id, data);
    const embed = buildTicketEmbed(ticketInfo, guild.name);
    const row = buildTicketButtons(!!ticketInfo.claimedBy);
    if (ticketInfo.panelMsgId) {
      try {
        const panelMsg = await channel.messages.fetch(ticketInfo.panelMsgId);
        await panelMsg.edit({ embeds: [embed], components: [row] });
      } catch {}
    }
  }

  const label = level === 'high' ? '🔴 High Priority' : '🟡 Low Priority';
  return interaction.editReply({ content: `✅ Ticket priority set to **${label}**.` });
}

async function adoptTicket(interaction) {
  const channel = interaction.channel;
  const guild = interaction.guild;
  const data = getGuildData(guild.id);
  const cfg = data.tickets.config;

  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  const isStaff = cfg.staffRoleId
    ? member && member.roles.cache.has(cfg.staffRoleId)
    : member && member.permissions.has('Administrator');
  if (!isStaff) {
    return interaction.reply({ content: '❌ Only staff can adopt tickets.', flags: MessageFlags.Ephemeral });
  }

  if (data.tickets.active[channel.id]) {
    return interaction.reply({ content: '✅ This channel is already registered as an active ticket.', flags: MessageFlags.Ephemeral });
  }

  const opener = interaction.options.getUser('opener');

  const numMatch = channel.name.match(/(\d+)$/);
  const ticketNum = numMatch ? parseInt(numMatch[1], 10) : (cfg.counter || 0) + 1;

  const priority = channel.name.startsWith('high') ? 'high' : 'low';

  const ticketInfo = {
    ticketNumber: ticketNum,
    userId: opener.id,
    openerTag: opener.tag,
    claimedBy: null,
    claimedByTag: null,
    openedAt: new Date().toISOString(),
    category: 'General',
    priority,
    answers: [],
    panelMsgId: null,
  };

  data.tickets.active[channel.id] = ticketInfo;
  saveGuildData(guild.id, data);

  const embed = buildTicketEmbed(ticketInfo, guild.name);
  const row = buildTicketButtons(false);
  const panelMsg = await channel.send({ embeds: [embed], components: [row] });

  data.tickets.active[channel.id].panelMsgId = panelMsg.id;
  saveGuildData(guild.id, data);

  return interaction.reply({ content: `✅ Ticket re-registered for <@${opener.id}>. Staff can now claim/close/handover it.`, flags: MessageFlags.Ephemeral });
}

async function acceptTicket(interaction) {
  const channel = interaction.channel;
  const guild = interaction.guild;
  const data = getGuildData(guild.id);
  const ticketInfo = data.tickets.active[channel.id];
  const cfg = data.tickets.config;

  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  const isStaff = cfg.staffRoleId
    ? member && member.roles.cache.has(cfg.staffRoleId)
    : member && member.permissions.has('Administrator');
  if (!isStaff) {
    return interaction.reply({ content: '❌ Only staff can accept tickets.', flags: MessageFlags.Ephemeral });
  }

  await interaction.reply({ content: '✅ Accepting ticket…', flags: MessageFlags.Ephemeral });

  const openerId = ticketInfo ? ticketInfo.userId : null;

  if (cfg.acceptRoleId && openerId) {
    try {
      const openerMember = await guild.members.fetch(openerId);
      await openerMember.roles.add(cfg.acceptRoleId);
    } catch (err) {
      console.error('Failed to assign accept role:', err);
    }
  }

  if (ticketInfo) {
    let transcriptFile;
    try {
      transcriptFile = await generateTranscript(channel, ticketInfo);
    } catch (err) {
      console.error('Transcript error:', err);
    }

    if (cfg.logChannelId) {
      try {
        const logChannel = await guild.channels.fetch(cfg.logChannelId);
        const logEmbed = new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle(`✅ Ticket #${ticketNumber(ticketInfo.ticketNumber)} Accepted`)
          .addFields(
            { name: 'Opened By', value: `<@${ticketInfo.userId}>`, inline: true },
            { name: 'Category', value: ticketInfo.category || 'General', inline: true },
            { name: 'Accepted By', value: `<@${interaction.user.id}>`, inline: true },
          )
          .setTimestamp();
        const sendOptions = { embeds: [logEmbed] };
        if (transcriptFile) sendOptions.files = [transcriptFile];
        await logChannel.send(sendOptions);
      } catch (err) {
        console.error('Failed to send to log channel:', err);
      }
    }

    try {
      const openerMember = await guild.members.fetch(ticketInfo.userId);
      const dmEmbed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('✅ Your application has been accepted!')
        .setDescription(`Your ticket **#${ticketNumber(ticketInfo.ticketNumber)}** in **${guild.name}** has been accepted. Welcome to the clan!`)
        .addFields({ name: 'Accepted By', value: `<@${interaction.user.id}>`, inline: true })
        .setTimestamp();
      await openerMember.send({ embeds: [dmEmbed] }).catch(() => {});
    } catch {}

    delete data.tickets.active[channel.id];
    saveGuildData(guild.id, data);
  }

  setTimeout(async () => { try { await channel.delete(); } catch {} }, 3000);
}

async function declineTicket(interaction) {
  const channel = interaction.channel;
  const data = getGuildData(interaction.guild.id);
  const ticketInfo = data.tickets.active[channel.id];
  const cfg = data.tickets.config;

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const isStaff = cfg.staffRoleId
    ? member && member.roles.cache.has(cfg.staffRoleId)
    : member && member.permissions.has('Administrator');
  if (!isStaff) {
    return interaction.reply({ content: '❌ Only staff can decline tickets.', flags: MessageFlags.Ephemeral });
  }

  if (ticketInfo && interaction.user.id === ticketInfo.userId) {
    return interaction.reply({ content: '❌ You cannot decline your own ticket.', flags: MessageFlags.Ephemeral });
  }

  const modal = new ModalBuilder()
    .setCustomId('ticket_decline_modal')
    .setTitle('Decline Ticket');

  const reasonInput = new TextInputBuilder()
    .setCustomId('decline_reason')
    .setLabel('Reason for declining')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('e.g. Does not meet requirements, missing information…')
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
  return interaction.showModal(modal);
}

async function handleDeclineModal(interaction) {
  const channel = interaction.channel;
  const guild = interaction.guild;
  const data = getGuildData(guild.id);
  const ticketInfo = data.tickets.active[channel.id];
  const cfg = data.tickets.config;
  const reason = interaction.fields.getTextInputValue('decline_reason');

  await interaction.reply({ content: '🚫 Declining ticket…', flags: MessageFlags.Ephemeral });

  if (ticketInfo) {
    let transcriptFile;
    try {
      transcriptFile = await generateTranscript(channel, ticketInfo);
    } catch (err) {
      console.error('Transcript error:', err);
    }

    if (cfg.logChannelId) {
      try {
        const logChannel = await guild.channels.fetch(cfg.logChannelId);
        const logEmbed = new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle(`🚫 Ticket #${ticketNumber(ticketInfo.ticketNumber)} Declined`)
          .addFields(
            { name: 'Opened By', value: `<@${ticketInfo.userId}>`, inline: true },
            { name: 'Category', value: ticketInfo.category || 'General', inline: true },
            { name: 'Declined By', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Decline Reason', value: reason, inline: false },
          )
          .setTimestamp();
        const sendOptions = { embeds: [logEmbed] };
        if (transcriptFile) sendOptions.files = [transcriptFile];
        await logChannel.send(sendOptions);
      } catch (err) {
        console.error('Failed to send to log channel:', err);
      }
    }

    if (cfg.declinedRoleId) {
      try {
        const openerMember = await guild.members.fetch(ticketInfo.userId);
        await openerMember.roles.add(cfg.declinedRoleId);
      } catch (err) {
        console.error('Failed to assign declined role:', err);
      }
    }

    try {
      const openerMember = await guild.members.fetch(ticketInfo.userId);
      const dmEmbed = new EmbedBuilder()
        .setColor(0xff4444)
        .setTitle('🚫 Your ticket has been declined')
        .setDescription(`Your ticket **#${ticketNumber(ticketInfo.ticketNumber)}** in **${guild.name}** has been declined.`)
        .addFields(
          { name: 'Declined By', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Reason', value: reason, inline: false },
        )
        .setTimestamp();
      await openerMember.send({ embeds: [dmEmbed] }).catch(() => {});
    } catch {}

    delete data.tickets.active[channel.id];
    saveGuildData(guild.id, data);
  }

  setTimeout(async () => { try { await channel.delete(); } catch {} }, 3000);
}

module.exports = { showTicketModal, handleModalSubmit, claimTicket, closeTicket, handleCloseModal, handoverTicket, setTicketPriority, adoptTicket, declineTicket, handleDeclineModal, acceptTicket };

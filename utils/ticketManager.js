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
  { label: 'How many hours do you have on Rust?', placeholder: 'e.g. 4000 hours', paragraph: false },
  { label: 'What is your Steam ID?', placeholder: 'Your 17-digit steamID64, e.g. 76561198000000000', paragraph: false },
  { label: 'What is your BattleMetrics profile link?', placeholder: 'https://www.battlemetrics.com/players/...', paragraph: false },
  { label: 'What can you do? (roles/skills)', placeholder: 'e.g. PVP, Builder, Farmer, Caller, Support…', paragraph: false },
  { label: 'Hours/day you can play? (10+ mandatory) Can you buy VIP?', placeholder: 'e.g. 12 hours a day. Yes / No for VIP', paragraph: false },
];

function ticketNumber(n) {
  return String(n).padStart(4, '0');
}

function getPriority(answers) {
  const text = answers.map((a) => a.answer).join(' ').toLowerCase();
  if (/\bvouch(ed|es|ing)?\b/.test(text)) return 'high';
  // High priority if they have 8000+ hours on Rust
  const rustHoursAnswer = answers.find((a) => a.question.toLowerCase().includes('how many hours do you have on rust'));
  if (rustHoursAnswer) {
    const match = rustHoursAnswer.answer.match(/\b(\d+)\b/);
    if (match && parseInt(match[1], 10) >= 8000) return 'high';
  }
  // High priority if they can play 10+ hours/day
  const hoursAnswer = answers.find((a) => a.question.toLowerCase().includes('hours/day'));
  if (hoursAnswer) {
    const match = hoursAnswer.answer.match(/\b(\d+)\b/);
    if (match && parseInt(match[1], 10) >= 10) return 'high';
  }
  return 'low';
}

function buildTicketEmbed(ticketInfo, guildName) {
  const embed = new EmbedBuilder()
    .setColor(ticketInfo.onHold ? 0xfaa61a : GOLD)
    .setTitle(`🎫 TICKET #${ticketNumber(ticketInfo.ticketNumber)}${ticketInfo.onHold ? ' · ⏸️ ON HOLD' : ''}`)
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
    { name: 'Opened', value: `<t:${Math.floor(new Date(ticketInfo.openedAt).getTime() / 1000)}:R>`, inline: true },
    {
      name: 'Status',
      value: ticketInfo.onHold
        ? `⏸️ On Hold · ${ticketInfo.claimedBy ? `Claimed by <@${ticketInfo.claimedBy}>` : 'Waiting for staff'}`
        : ticketInfo.claimedBy ? `Claimed by <@${ticketInfo.claimedBy}>` : 'Waiting for staff',
      inline: true,
    },
    { name: 'Priority', value: priorityLabel, inline: true },
  );

  return embed;
}

function buildTicketButtons(claimed = false, onHold = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_claim')
      .setLabel(claimed ? 'Claimed' : 'Claim')
      .setEmoji('🙋')
      .setStyle(claimed ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(claimed),
    new ButtonBuilder()
      .setCustomId('ticket_hold')
      .setLabel(onHold ? 'Resume' : 'Hold')
      .setEmoji(onHold ? '▶️' : '⏸️')
      .setStyle(onHold ? ButtonStyle.Success : ButtonStyle.Secondary),
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
      return interaction.reply({ content: '❌ You are not permitted to open a ticket.', flags: MessageFlags.Ephemeral });
    }
  }

  const questions = cfg.questions.length ? cfg.questions : DEFAULT_QUESTIONS;

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

  const existingEntry = Object.entries(data.tickets.active).find(([, t]) => t.userId === user.id);
  if (existingEntry) {
    const [channelId] = existingEntry;
    const existingChannel = await guild.channels.fetch(channelId).catch(() => null);
    if (!existingChannel) {
      delete data.tickets.active[channelId];
      saveGuildData(guildId, data);
    } else {
      return interaction.reply({ content: `You already have an open ticket: <#${channelId}>`, flags: MessageFlags.Ephemeral });
    }
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
  const channelName = priority === 'high' ? `high-prio-${ticketNumber(num)}` : `low-prio-${ticketNumber(num)}`;

  const permissionOverwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles,
      ],
    },
  ];

  if (cfg.staffRoleId) {
    permissionOverwrites.push({
      id: cfg.staffRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles,
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
  const pingContent = cfg.staffRoleId ? `<@${user.id}> | <@&${cfg.staffRoleId}>` : `<@${user.id}>`;

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
    return interaction.reply({ content: '❌ You cannot claim your own ticket.', flags: MessageFlags.Ephemeral });
  }

  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  const isStaff = cfg.staffRoleId
    ? member && member.roles.cache.has(cfg.staffRoleId)
    : member && member.permissions.has('Administrator');
  if (!isStaff) {
    return interaction.reply({ content: '❌ Only staff can claim tickets.', flags: MessageFlags.Ephemeral });
  }

  if (ticketInfo) {
    if (ticketInfo.claimedBy) {
      return interaction.reply({ content: `Already claimed by <@${ticketInfo.claimedBy}>.`, flags: MessageFlags.Ephemeral });
    }
    ticketInfo.claimedBy = interaction.user.id;
    ticketInfo.claimedByTag = interaction.user.tag;
    saveGuildData(guild.id, data);

    const embed = buildTicketEmbed(ticketInfo, guild.name);
    const row = buildTicketButtons(true, ticketInfo.onHold);
    if (ticketInfo.panelMsgId) {
      try {
        const panelMsg = await channel.messages.fetch(ticketInfo.panelMsgId);
        await panelMsg.edit({ embeds: [embed], components: [row] });
      } catch {}
    }
  }

  return interaction.reply({ content: `✅ <@${interaction.user.id}> has claimed this ticket.` });
}

async function holdTicket(interaction) {
  const channel = interaction.channel;
  const guild = interaction.guild;
  const data = getGuildData(guild.id);
  const ticketInfo = data.tickets.active[channel.id];

  if (!ticketInfo) {
    return interaction.reply({ content: '⚠️ This ticket\'s data could not be found — it may have already been closed. If this channel is no longer needed, a staff member can delete it manually.', flags: MessageFlags.Ephemeral });
  }

  const cfg = data.tickets.config;
  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  const isStaff = cfg.staffRoleId
    ? member && member.roles.cache.has(cfg.staffRoleId)
    : member && member.permissions.has('Administrator');
  if (!isStaff) {
    return interaction.reply({ content: '❌ Only staff can put tickets on hold.', flags: MessageFlags.Ephemeral });
  }

  ticketInfo.onHold = !ticketInfo.onHold;
  saveGuildData(guild.id, data);

  const embed = buildTicketEmbed(ticketInfo, guild.name);
  const row = buildTicketButtons(!!ticketInfo.claimedBy, ticketInfo.onHold);

  if (ticketInfo.panelMsgId) {
    try {
      const panelMsg = await channel.messages.fetch(ticketInfo.panelMsgId);
      await panelMsg.edit({ embeds: [embed], components: [row] });
    } catch {}
  }

  const status = ticketInfo.onHold ? '⏸️ Ticket put on hold.' : '▶️ Ticket resumed.';
  return interaction.reply({ content: status });
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
      return interaction.reply({ content: '❌ You cannot close your own ticket.', flags: MessageFlags.Ephemeral });
    }
  }

  const modal = new ModalBuilder().setCustomId('ticket_close_modal').setTitle('Close Ticket');
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

  try {
    await interaction.reply({ content: '📋 Saving transcript and closing…', flags: MessageFlags.Ephemeral });
  } catch (err) {
    console.error('Close ack failed (continuing anyway):', err.message);
  }

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

    // DM the opener
    try {
      const opener = await guild.members.fetch(ticketInfo.userId).catch(() => null);
      if (opener) {
        const dmEmbed = new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle(`🔒 Ticket #${ticketNumber(ticketInfo.ticketNumber)} Closed`)
          .setDescription(`Your ticket in **${guild.name}** has been closed.\n\n**Reason:** ${reason}`)
          .setTimestamp();
        await opener.send({ embeds: [dmEmbed] }).catch(() => {});
      }
    } catch {}

    delete data.tickets.active[channel.id];
    saveGuildData(guild.id, data);
  }

  await new Promise((r) => setTimeout(r, 1500));
  try {
    await channel.delete();
  } catch (err) {
    console.error('Failed to delete ticket channel:', err);
  }
}

async function declineTicket(interaction) {
  const channel = interaction.channel;
  const data = getGuildData(interaction.guild.id);
  const ticketInfo = data.tickets.active[channel.id];
  const cfg = data.tickets.config;

  if (!ticketInfo) {
    return interaction.reply({ content: '⚠️ This ticket\'s data could not be found — it may have already been closed. If this channel is no longer needed, a staff member can delete it manually.', flags: MessageFlags.Ephemeral });
  }

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const isStaff = cfg.staffRoleId
    ? member && member.roles.cache.has(cfg.staffRoleId)
    : member && member.permissions.has('Administrator');
  if (!isStaff) {
    return interaction.reply({ content: '❌ Only staff can decline tickets.', flags: MessageFlags.Ephemeral });
  }

  const modal = new ModalBuilder().setCustomId('ticket_decline_modal').setTitle('Decline Application');
  const reasonInput = new TextInputBuilder()
    .setCustomId('decline_reason')
    .setLabel('Reason for declining')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('e.g. Does not meet requirements, Not enough hours…')
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
  return interaction.showModal(modal);
}

async function handleDeclineModal(interaction) {
  const channel = interaction.channel;
  const guild = interaction.guild;
  const data = getGuildData(guild.id);
  const ticketInfo = data.tickets.active[channel.id];
  const reason = interaction.fields.getTextInputValue('decline_reason');
  const cfg = data.tickets.config;

  try {
    await interaction.reply({ content: '🚫 Declining and closing ticket…', flags: MessageFlags.Ephemeral });
  } catch {}

  if (ticketInfo) {
    // Assign declined role if configured
    if (cfg.declinedRoleId) {
      try {
        const opener = await guild.members.fetch(ticketInfo.userId).catch(() => null);
        if (opener) await opener.roles.add(cfg.declinedRoleId).catch(() => {});
      } catch {}
    }

    // Log to log channel
    if (cfg.logChannelId) {
      try {
        const logChannel = await guild.channels.fetch(cfg.logChannelId);
        const logEmbed = new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle(`🚫 Ticket #${ticketNumber(ticketInfo.ticketNumber)} Declined`)
          .addFields(
            { name: 'Applicant', value: `<@${ticketInfo.userId}>`, inline: true },
            { name: 'Declined By', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Decline Reason', value: reason, inline: false },
          )
          .setTimestamp();
        await logChannel.send({ embeds: [logEmbed] });
      } catch {}
    }

    // DM the opener
    try {
      const opener = await guild.members.fetch(ticketInfo.userId).catch(() => null);
      if (opener) {
        const dmEmbed = new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle(`🚫 Application Declined — ${guild.name}`)
          .setDescription(`Your application has been declined.\n\n**Reason:** ${reason}\n\nYou may re-apply in the future if your situation changes.`)
          .setTimestamp();
        await opener.send({ embeds: [dmEmbed] }).catch(() => {});
      }
    } catch {}

    delete data.tickets.active[channel.id];
    saveGuildData(guild.id, data);
  }

  await new Promise((r) => setTimeout(r, 1500));
  try {
    await channel.delete();
  } catch {}
}

async function acceptTicket(interaction) {
  const channel = interaction.channel;
  const guild = interaction.guild;
  const data = getGuildData(guild.id);
  const ticketInfo = data.tickets.active[channel.id];
  const cfg = data.tickets.config;

  if (!ticketInfo) {
    return interaction.reply({ content: '⚠️ This ticket\'s data could not be found — it may have already been closed. If this channel is no longer needed, a staff member can delete it manually.', flags: MessageFlags.Ephemeral });
  }

  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  const isStaff = cfg.staffRoleId
    ? member && member.roles.cache.has(cfg.staffRoleId)
    : member && member.permissions.has('Administrator');
  if (!isStaff) {
    return interaction.reply({ content: '❌ Only staff can accept tickets.', flags: MessageFlags.Ephemeral });
  }

  await interaction.reply({ content: '✅ Accepting and closing ticket…', flags: MessageFlags.Ephemeral });

  // Assign accept role if configured
  if (cfg.acceptRoleId) {
    try {
      const opener = await guild.members.fetch(ticketInfo.userId).catch(() => null);
      if (opener) await opener.roles.add(cfg.acceptRoleId).catch(() => {});
    } catch {}
  }

  // Log to log channel
  if (cfg.logChannelId) {
    try {
      const logChannel = await guild.channels.fetch(cfg.logChannelId);
      const logEmbed = new EmbedBuilder()
        .setColor(0x00c853)
        .setTitle(`✅ Ticket #${ticketNumber(ticketInfo.ticketNumber)} Accepted`)
        .addFields(
          { name: 'Applicant', value: `<@${ticketInfo.userId}>`, inline: true },
          { name: 'Accepted By', value: `<@${interaction.user.id}>`, inline: true },
        )
        .setTimestamp();
      await logChannel.send({ embeds: [logEmbed] });
    } catch {}
  }

  // DM the opener
  try {
    const opener = await guild.members.fetch(ticketInfo.userId).catch(() => null);
    if (opener) {
      const dmEmbed = new EmbedBuilder()
        .setColor(0x00c853)
        .setTitle(`✅ Application Accepted — ${guild.name}`)
        .setDescription(`Congratulations! Your application to **${guild.name}** has been accepted.\nWelcome to the team!`)
        .setTimestamp();
      await opener.send({ embeds: [dmEmbed] }).catch(() => {});
    }
  } catch {}

  delete data.tickets.active[channel.id];
  saveGuildData(guild.id, data);

  await new Promise((r) => setTimeout(r, 1500));
  try {
    await channel.delete();
  } catch {}
}

async function refreshTicketPanels(client) {
  for (const guild of client.guilds.cache.values()) {
    try {
      const data = getGuildData(guild.id);
      for (const [channelId, ticketInfo] of Object.entries(data.tickets.active)) {
        try {
          const channel = await guild.channels.fetch(channelId).catch(() => null);
          if (!channel) {
            delete data.tickets.active[channelId];
            saveGuildData(guild.id, data);
            continue;
          }
          if (ticketInfo.panelMsgId) {
            try {
              const panelMsg = await channel.messages.fetch(ticketInfo.panelMsgId);
              const embed = buildTicketEmbed(ticketInfo, guild.name);
              const row = buildTicketButtons(!!ticketInfo.claimedBy, !!ticketInfo.onHold);
              await panelMsg.edit({ embeds: [embed], components: [row] });
            } catch {}
          }
        } catch {}
      }
    } catch {}
  }
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
    return interaction.reply({ content: '⚠️ This channel is already registered as an active ticket.', flags: MessageFlags.Ephemeral });
  }

  const opener = interaction.options.getUser('opener');
  cfg.counter = (cfg.counter || 0) + 1;
  const num = cfg.counter;

  const ticketInfo = {
    ticketNumber: num,
    userId: opener.id,
    openerTag: opener.tag,
    claimedBy: null,
    claimedByTag: null,
    openedAt: new Date().toISOString(),
    category: 'General',
    priority: 'low',
    answers: [],
    panelMsgId: null,
  };

  data.tickets.active[channel.id] = ticketInfo;
  saveGuildData(guild.id, data);

  const embed = buildTicketEmbed(ticketInfo, guild.name);
  const row = buildTicketButtons(false, false);
  const panelMsg = await channel.send({ embeds: [embed], components: [row] });

  data.tickets.active[channel.id].panelMsgId = panelMsg.id;
  saveGuildData(guild.id, data);

  return interaction.reply({
    content: `✅ Channel adopted as Ticket #${ticketNumber(num)} for <@${opener.id}>.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handoverTicket(interaction) {
  const channel = interaction.channel;
  const guild = interaction.guild;
  const data = getGuildData(guild.id);
  const ticketInfo = data.tickets.active[channel.id];
  const cfg = data.tickets.config;

  if (!ticketInfo) {
    return interaction.reply({ content: '⚠️ This ticket\'s data could not be found — it may have already been closed. If this channel is no longer needed, a staff member can delete it manually.', flags: MessageFlags.Ephemeral });
  }

  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  const isStaff = cfg.staffRoleId
    ? member && member.roles.cache.has(cfg.staffRoleId)
    : member && member.permissions.has('Administrator');
  if (!isStaff) {
    return interaction.reply({ content: '❌ Only staff can hand over tickets.', flags: MessageFlags.Ephemeral });
  }

  const targetUser = interaction.options.getUser('user');
  const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);

  if (!targetMember) {
    return interaction.reply({ content: '❌ User not found in this server.', flags: MessageFlags.Ephemeral });
  }

  const prevClaimant = ticketInfo.claimedBy;
  ticketInfo.claimedBy = targetUser.id;
  ticketInfo.claimedByTag = targetUser.tag;
  saveGuildData(guild.id, data);

  const embed = buildTicketEmbed(ticketInfo, guild.name);
  const row = buildTicketButtons(true, !!ticketInfo.onHold);
  if (ticketInfo.panelMsgId) {
    try {
      const panelMsg = await channel.messages.fetch(ticketInfo.panelMsgId);
      await panelMsg.edit({ embeds: [embed], components: [row] });
    } catch {}
  }

  const from = prevClaimant ? `<@${prevClaimant}>` : 'nobody';
  return interaction.reply({ content: `🔄 Ticket handed over from ${from} to <@${targetUser.id}>.` });
}

async function setTicketPriority(interaction) {
  const channel = interaction.channel;
  const guild = interaction.guild;
  const data = getGuildData(guild.id);
  const ticketInfo = data.tickets.active[channel.id];
  const cfg = data.tickets.config;

  if (!ticketInfo) {
    return interaction.reply({ content: '⚠️ This ticket\'s data could not be found — it may have already been closed. If this channel is no longer needed, a staff member can delete it manually.', flags: MessageFlags.Ephemeral });
  }

  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  const isStaff = cfg.staffRoleId
    ? member && member.roles.cache.has(cfg.staffRoleId)
    : member && member.permissions.has('Administrator');
  if (!isStaff) {
    return interaction.reply({ content: '❌ Only staff can set ticket priority.', flags: MessageFlags.Ephemeral });
  }

  const level = interaction.options.getString('level');
  ticketInfo.priority = level;

  // Rename channel to reflect new priority
  const num = ticketNumber(ticketInfo.ticketNumber);
  const newName = level === 'high' ? `high-prio-${num}` : `low-prio-${num}`;
  try {
    await channel.setName(newName);
  } catch {}

  saveGuildData(guild.id, data);

  const embed = buildTicketEmbed(ticketInfo, guild.name);
  const row = buildTicketButtons(!!ticketInfo.claimedBy, !!ticketInfo.onHold);
  if (ticketInfo.panelMsgId) {
    try {
      const panelMsg = await channel.messages.fetch(ticketInfo.panelMsgId);
      await panelMsg.edit({ embeds: [embed], components: [row] });
    } catch {}
  }

  const label = level === 'high' ? '🔴 High Priority' : '🟡 Low Priority';
  return interaction.reply({ content: `✅ Priority set to **${label}**.`, flags: MessageFlags.Ephemeral });
}

module.exports = {
  showTicketModal,
  handleModalSubmit,
  claimTicket,
  closeTicket,
  handleCloseModal,
  declineTicket,
  handleDeclineModal,
  acceptTicket,
  holdTicket,
  refreshTicketPanels,
  adoptTicket,
  handoverTicket,
  setTicketPriority,
};

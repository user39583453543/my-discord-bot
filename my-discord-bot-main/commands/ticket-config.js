const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType,
} = require('discord.js');
const { GOLD } = require('../theme');
const { getGuildData, saveGuildData } = require('../utils/storage');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-config')
    .setDescription('Configure the ticket system')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName('staffrole').setDescription('Set the staff role that can see and manage tickets')
        .addRoleOption((opt) => opt.setName('role').setDescription('Staff role').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub.setName('logchannel').setDescription('Set the channel where transcripts are sent on close')
        .addChannelOption((opt) =>
          opt.setName('channel').setDescription('Log channel').addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('category').setDescription('Set the Discord category where ticket channels are created')
        .addChannelOption((opt) =>
          opt.setName('category').setDescription('Discord channel category').addChannelTypes(ChannelType.GuildCategory).setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('addquestion').setDescription('Add a question to the ticket form (max 5 total)')
        .addStringOption((opt) => opt.setName('label').setDescription('The question text').setRequired(true))
        .addStringOption((opt) => opt.setName('placeholder').setDescription('Placeholder hint text shown inside the box').setRequired(false))
        .addBooleanOption((opt) => opt.setName('paragraph').setDescription('Use a large text box? (default: false)').setRequired(false))
    )
    .addSubcommand((sub) =>
      sub.setName('clearquestions').setDescription('Remove all custom questions (resets to default)')
    )
    .addSubcommand((sub) =>
      sub.setName('acceptrole').setDescription('Set the role given to users when their ticket is accepted')
        .addRoleOption((opt) => opt.setName('role').setDescription('Accept role').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub.setName('declinedrole').setDescription('Set the role given to users when their ticket is declined (blocks future tickets)')
        .addRoleOption((opt) => opt.setName('role').setDescription('Declined role').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub.setName('view').setDescription('View the current ticket system configuration')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const data = getGuildData(guildId);
    const cfg = data.tickets.config;

    if (sub === 'staffrole') {
      const role = interaction.options.getRole('role');
      cfg.staffRoleId = role.id;
      saveGuildData(guildId, data);
      return interaction.reply({ content: `✅ Staff role set to ${role}.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'logchannel') {
      const channel = interaction.options.getChannel('channel');
      cfg.logChannelId = channel.id;
      saveGuildData(guildId, data);
      return interaction.reply({ content: `✅ Log channel set to ${channel}.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'category') {
      const cat = interaction.options.getChannel('category');
      cfg.categoryId = cat.id;
      saveGuildData(guildId, data);
      return interaction.reply({ content: `✅ Ticket category set to **${cat.name}**.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'addquestion') {
      if (cfg.questions.length >= 5) {
        return interaction.reply({
          content: '❌ You already have 5 questions (Discord modal limit). Use `/ticket-config clearquestions` to reset.',
          flags: MessageFlags.Ephemeral,
        });
      }
      const label = interaction.options.getString('label');
      const placeholder = interaction.options.getString('placeholder') || '';
      const paragraph = interaction.options.getBoolean('paragraph') ?? false;
      cfg.questions.push({ label, placeholder, paragraph });
      saveGuildData(guildId, data);
      return interaction.reply({
        content: `✅ Question ${cfg.questions.length}/5 added: **${label}**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'clearquestions') {
      cfg.questions = [];
      saveGuildData(guildId, data);
      return interaction.reply({ content: '✅ All custom questions cleared. The form will use the default question.', flags: MessageFlags.Ephemeral });
    }

    if (sub === 'acceptrole') {
      const role = interaction.options.getRole('role');
      cfg.acceptRoleId = role.id;
      saveGuildData(guildId, data);
      return interaction.reply({ content: `✅ Accept role set to ${role}. Users will receive this role when their ticket is accepted.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'declinedrole') {
      const role = interaction.options.getRole('role');
      cfg.declinedRoleId = role.id;
      saveGuildData(guildId, data);
      return interaction.reply({ content: `✅ Declined role set to ${role}. Users with this role will be blocked from opening tickets.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'view') {
      const questionList = cfg.questions.length
        ? cfg.questions.map((q, i) => `${i + 1}. **${q.label}**${q.paragraph ? ' *(paragraph)*' : ''}`).join('\n')
        : '_Using default: "Please describe your issue"_';

      const embed = new EmbedBuilder()
        .setColor(GOLD)
        .setTitle('🎫 Ticket System Configuration')
        .addFields(
          { name: 'Staff Role', value: cfg.staffRoleId ? `<@&${cfg.staffRoleId}>` : 'Not set', inline: true },
          { name: 'Log Channel', value: cfg.logChannelId ? `<#${cfg.logChannelId}>` : 'Not set', inline: true },
          { name: 'Ticket Category', value: cfg.categoryId ? `<#${cfg.categoryId}>` : 'Not set', inline: true },
          { name: 'Accept Role', value: cfg.acceptRoleId ? `<@&${cfg.acceptRoleId}>` : 'Not set', inline: true },
          { name: 'Declined Role', value: cfg.declinedRoleId ? `<@&${cfg.declinedRoleId}>` : 'Not set', inline: true },
          { name: 'Total Tickets Created', value: String(cfg.counter || 0), inline: true },
          { name: 'Open Tickets', value: String(Object.keys(data.tickets.active).length), inline: true },
          { name: `Form Questions (${cfg.questions.length}/5)`, value: questionList, inline: false },
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};

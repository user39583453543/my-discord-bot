const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { GOLD } = require('../theme');
const { getGuildData, saveGuildData } = require('../utils/storage');

function keyFor(category) {
  return category.trim().toLowerCase();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-questions')
    .setDescription('Set custom application questions per ticket category')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName('add').setDescription('Add a question to a specific category (max 5)')
        .addStringOption((opt) => opt.setName('category').setDescription('Category name, exactly as used in /ticket-setup').setRequired(true))
        .addStringOption((opt) => opt.setName('label').setDescription('The question text').setRequired(true))
        .addStringOption((opt) => opt.setName('placeholder').setDescription('Placeholder hint text shown inside the box').setRequired(false))
        .addBooleanOption((opt) => opt.setName('paragraph').setDescription('Use a large text box? (default: false)').setRequired(false))
    )
    .addSubcommand((sub) =>
      sub.setName('clear').setDescription('Clear custom questions for a category (falls back to the default question set)')
        .addStringOption((opt) => opt.setName('category').setDescription('Category name').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub.setName('view').setDescription('View the questions currently set for a category')
        .addStringOption((opt) => opt.setName('category').setDescription('Category name').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('List every category that has custom questions set')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const data = getGuildData(guildId);
    const cfg = data.tickets.config;
    if (!cfg.categoryQuestions) cfg.categoryQuestions = {};

    if (sub === 'add') {
      const category = interaction.options.getString('category');
      const key = keyFor(category);
      const label = interaction.options.getString('label');
      const placeholder = interaction.options.getString('placeholder') || '';
      const paragraph = interaction.options.getBoolean('paragraph') ?? false;

      if (!cfg.categoryQuestions[key]) cfg.categoryQuestions[key] = [];
      if (cfg.categoryQuestions[key].length >= 5) {
        return interaction.reply({
          content: `❌ **${category}** already has 5 questions (Discord's modal limit). Use \`/ticket-questions clear\` to reset it first.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      cfg.categoryQuestions[key].push({ label, placeholder, paragraph });
      saveGuildData(guildId, data);
      return interaction.reply({
        content: `✅ Question ${cfg.categoryQuestions[key].length}/5 added to **${category}**: **${label}**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'clear') {
      const category = interaction.options.getString('category');
      const key = keyFor(category);
      delete cfg.categoryQuestions[key];
      saveGuildData(guildId, data);
      return interaction.reply({
        content: `✅ Custom questions cleared for **${category}**. It will now use the default question set.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'view') {
      const category = interaction.options.getString('category');
      const key = keyFor(category);
      const questions = cfg.categoryQuestions[key];

      const embed = new EmbedBuilder().setColor(GOLD).setTitle(`🎫 Questions — ${category}`).setTimestamp();
      embed.setDescription(
        questions && questions.length
          ? questions.map((q, i) => `${i + 1}. **${q.label}**${q.paragraph ? ' *(paragraph)*' : ''}`).join('\n')
          : '_No custom questions set — this category uses the default question set._'
      );
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'list') {
      const keys = Object.keys(cfg.categoryQuestions).filter((k) => cfg.categoryQuestions[k]?.length);
      const embed = new EmbedBuilder().setColor(GOLD).setTitle('🎫 Categories with custom questions').setTimestamp();
      embed.setDescription(
        keys.length
          ? keys.map((k) => `• **${k}** (${cfg.categoryQuestions[k].length} question${cfg.categoryQuestions[k].length !== 1 ? 's' : ''})`).join('\n')
          : '_None yet. Use `/ticket-questions add` to set some._'
      );
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};

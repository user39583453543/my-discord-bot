const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const { GOLD } = require('../theme');
const { getGuildData, saveGuildData } = require('../utils/storage');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('track')
    .setDescription('BattleMetrics hours leaderboard tracker')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Set up or update the hours leaderboard (opens a modal)')
    )
    .addSubcommand((sub) =>
      sub
        .setName('status')
        .setDescription('Show the current hours leaderboard configuration')
    )
    .addSubcommand((sub) =>
      sub
        .setName('clear')
        .setDescription('Remove the hours leaderboard configuration for this server')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === 'setup') {
      const data = getGuildData(guildId);
      const existing = data.hoursBoard || {};

      const modal = new ModalBuilder()
        .setCustomId('track_setup_modal')
        .setTitle('Hours Leaderboard Setup');

      const serverIdInput = new TextInputBuilder()
        .setCustomId('bm_server_id')
        .setLabel('BattleMetrics Server ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. 12747928')
        .setValue(existing.serverId || '12747928')
        .setRequired(true)
        .setMaxLength(20);

      const channelIdInput = new TextInputBuilder()
        .setCustomId('channel_id')
        .setLabel('Discord Channel ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Right-click a channel → Copy ID')
        .setValue(existing.channelId || '')
        .setRequired(true)
        .setMaxLength(25);

      const playerListInput = new TextInputBuilder()
        .setCustomId('player_list')
        .setLabel('Player List (steamid - name, one per line)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder(
          '76561198000000001 - PlayerOne\n76561198000000002 - PlayerTwo\n76561198000000003 - PlayerThree'
        )
        .setValue(
          existing.players
            ? existing.players.map((p) => `${p.steamId} - ${p.name}`).join('\n')
            : ''
        )
        .setRequired(true)
        .setMaxLength(4000);

      modal.addComponents(
        new ActionRowBuilder().addComponents(serverIdInput),
        new ActionRowBuilder().addComponents(channelIdInput),
        new ActionRowBuilder().addComponents(playerListInput)
      );

      return interaction.showModal(modal);
    }

    if (sub === 'status') {
      const data = getGuildData(guildId);
      const board = data.hoursBoard;

      if (!board || !board.serverId) {
        return interaction.reply({
          content: '❌ No hours leaderboard is configured. Use `/track setup` to set one up.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = new EmbedBuilder()
        .setColor(GOLD)
        .setTitle('📊 Hours Leaderboard Config')
        .addFields(
          { name: 'BM Server ID', value: `\`${board.serverId}\``, inline: true },
          { name: 'Channel', value: `<#${board.channelId}>`, inline: true },
          { name: 'Message', value: board.messageId ? `[Jump](https://discord.com/channels/${guildId}/${board.channelId}/${board.messageId})` : 'Not posted yet', inline: true },
          {
            name: `Players (${board.players?.length || 0})`,
            value: board.players?.length
              ? board.players.map((p) => `\`${p.steamId}\` — ${p.name}`).join('\n').slice(0, 1024)
              : 'None',
            inline: false,
          }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'clear') {
      const data = getGuildData(guildId);
      data.hoursBoard = null;
      saveGuildData(guildId, data);
      return interaction.reply({
        content: '✅ Hours leaderboard configuration cleared.',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

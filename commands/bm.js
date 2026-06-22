const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');
const { GOLD } = require('../theme');
const { getGuildData, saveGuildData } = require('../utils/storage');
const bm = require('../utils/battlemetrics');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bm')
    .setDescription('BattleMetrics Rust tracker')
    .addSubcommand((sub) =>
      sub
        .setName('server')
        .setDescription('Search for a Rust server')
        .addStringOption((opt) =>
          opt.setName('search').setDescription('Server name to search').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('player')
        .setDescription('Look up a player by name')
        .addStringOption((opt) =>
          opt.setName('name').setDescription('Player name').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('track')
        .setDescription('Track a player and get alerts when they go online/offline')
        .addStringOption((opt) =>
          opt.setName('player-id').setDescription('BattleMetrics player ID').setRequired(true)
        )
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Channel to send alerts to')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('untrack')
        .setDescription('Stop tracking a player')
        .addStringOption((opt) =>
          opt.setName('player-id').setDescription('BattleMetrics player ID').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('bulktrack')
        .setDescription('Track up to 50 players at once by pasting their Steam IDs')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Channel to send alerts to')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('watchlist').setDescription('View all currently tracked players')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const data = getGuildData(guildId);
    if (!data.tracker) data.tracker = { tracked: [] };

    if (sub === 'server') {
      await interaction.deferReply();
      const query = interaction.options.getString('search');

      let servers;
      try {
        servers = await bm.searchServers(query);
      } catch {
        return interaction.editReply('❌ Failed to reach BattleMetrics API.');
      }

      if (!servers.length) return interaction.editReply('No servers found.');

      const embed = new EmbedBuilder()
        .setColor(GOLD)
        .setTitle(`🔍 Server Search: "${query}"`)
        .setTimestamp();

      for (const s of servers.slice(0, 5)) {
        const a = s.attributes;
        const status = a.status === 'online' ? '🟢' : '🔴';
        embed.addFields({
          name: `${status} ${a.name}`,
          value: `Players: **${a.players}/${a.maxPlayers}** · Rank: #${a.rank || '?'} · ID: \`${s.id}\``,
          inline: false,
        });
      }

      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'player') {
      await interaction.deferReply();
      const name = interaction.options.getString('name');

      let players;
      try {
        players = await bm.searchPlayers(name);
      } catch (err) {
        if (err.response?.status === 401) {
          return interaction.editReply('❌ A BattleMetrics API token is required for player lookups. Set `BATTLEMETRICS_TOKEN` in your secrets.');
        }
        return interaction.editReply('❌ Failed to reach BattleMetrics API.');
      }

      if (!players.length) return interaction.editReply('No players found.');

      const embed = new EmbedBuilder()
        .setColor(GOLD)
        .setTitle(`👤 Player Search: "${name}"`)
        .setTimestamp();

      for (const p of players.slice(0, 5)) {
        const a = p.attributes;
        embed.addFields({
          name: a.name,
          value: `ID: \`${p.id}\` · Last seen: ${a.updatedAt ? `<t:${Math.floor(new Date(a.updatedAt).getTime() / 1000)}:R>` : 'Unknown'}`,
          inline: false,
        });
      }

      embed.setFooter({ text: 'Use /bm track player-id:<ID> to track a player' });
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'track') {
      const playerId = interaction.options.getString('player-id');
      const channel = interaction.options.getChannel('channel');

      const already = data.tracker.tracked.find((t) => t.bmPlayerId === playerId);
      if (already) {
        return interaction.reply({ content: '⚠️ That player is already being tracked.', flags: MessageFlags.Ephemeral });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      let player;
      try {
        player = await bm.getPlayer(playerId);
      } catch (err) {
        if (err.response?.status === 401) {
          return interaction.editReply('❌ A BattleMetrics API token is required. Set `BATTLEMETRICS_TOKEN` in your secrets.');
        }
        return interaction.editReply('❌ Could not find that player ID.');
      }

      const entry = {
        bmPlayerId: playerId,
        name: player.attributes.name,
        alertChannelId: channel.id,
        lastServerId: null,
        lastServerName: null,
        online: false,
        addedBy: interaction.user.id,
      };

      data.tracker.tracked.push(entry);
      saveGuildData(guildId, data);

      return interaction.editReply(`✅ Now tracking **${player.attributes.name}** — alerts will be sent to ${channel}.`);
    }

    if (sub === 'untrack') {
      const playerId = interaction.options.getString('player-id');
      const before = data.tracker.tracked.length;
      const entry = data.tracker.tracked.find((t) => t.bmPlayerId === playerId);
      data.tracker.tracked = data.tracker.tracked.filter((t) => t.bmPlayerId !== playerId);

      if (data.tracker.tracked.length === before) {
        return interaction.reply({ content: '❌ That player is not being tracked.', flags: MessageFlags.Ephemeral });
      }

      saveGuildData(guildId, data);
      return interaction.reply({ content: `✅ Stopped tracking **${entry?.name || playerId}**.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'bulktrack') {
      const channel = interaction.options.getChannel('channel');
      const modal = new ModalBuilder()
        .setCustomId(`bm_bulktrack_modal:${channel.id}`)
        .setTitle('Bulk Track Players');
      const input = new TextInputBuilder()
        .setCustomId('steam_ids')
        .setLabel('Steam IDs — one per line (up to 50)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('76561198000000000\n76561198000000001\n...')
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (sub === 'watchlist') {
      const list = data.tracker.tracked;

      if (!list.length) {
        return interaction.reply({ content: 'No players are being tracked. Use `/bm track` to add one.', flags: MessageFlags.Ephemeral });
      }

      const embed = new EmbedBuilder()
        .setColor(GOLD)
        .setTitle('📋 Tracked Players')
        .setTimestamp();

      for (const t of list) {
        embed.addFields({
          name: t.name,
          value: `ID: \`${t.bmPlayerId}\` · Status: ${t.online ? '🟢 Online' : '🔴 Offline'} · Alerts: <#${t.alertChannelId}>`,
          inline: false,
        });
      }

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};

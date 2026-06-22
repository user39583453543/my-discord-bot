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
        .addStringOption((opt) =>
          opt
            .setName('server-id')
            .setDescription('Only alert when players join this BattleMetrics server ID (optional)')
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('playtime')
        .setDescription('Check playtime for a single player (last 10 days) or all tracked players')
        .addStringOption((opt) =>
          opt.setName('player-id').setDescription('BattleMetrics player ID for individual lookup').setRequired(false)
        )
        .addBooleanOption((opt) =>
          opt.setName('all').setDescription('Show playtime for all tracked players').setRequired(false)
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
      const serverId = interaction.options.getString('server-id') || '';
      const modal = new ModalBuilder()
        .setCustomId(`bm_bulktrack_modal:${channel.id}:${serverId}`)
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

    if (sub === 'playtime') {
      const playerId = interaction.options.getString('player-id');
      const showAll = interaction.options.getBoolean('all');

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // Individual player — full 10-day breakdown
      if (playerId) {
        let player, sessions;
        try {
          player = await bm.getPlayer(playerId);
          sessions = await bm.getPlayerRecentSessions(playerId, 50);
        } catch {
          return interaction.editReply('❌ Could not fetch player data.');
        }

        const now = Date.now();
        const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;
        const recent = sessions.filter(s => new Date(s.attributes.start).getTime() > tenDaysAgo);

        // Total hours
        let totalMs = 0;
        const dayMap = {};
        for (const s of recent) {
          const start = new Date(s.attributes.start).getTime();
          const stop = s.attributes.stop ? new Date(s.attributes.stop).getTime() : now;
          const dur = stop - start;
          totalMs += dur;
          const day = new Date(start).toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' });
          dayMap[day] = (dayMap[day] || 0) + dur;
        }

        const totalHrs = (totalMs / 3600000).toFixed(1);
        const days = Object.keys(dayMap).length || 1;
        const avgHrs = (totalMs / 3600000 / days).toFixed(1);

        const topDays = Object.entries(dayMap)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([day, ms]) => `${day} — **${(ms / 3600000).toFixed(1)} hrs**`)
          .join('\n');

        const firstSeen = player.attributes.createdAt ? `<t:${Math.floor(new Date(player.attributes.createdAt).getTime() / 1000)}:D>` : 'Unknown';
        const lastSeen = player.attributes.updatedAt ? `<t:${Math.floor(new Date(player.attributes.updatedAt).getTime() / 1000)}:R>` : 'Unknown';

        const embed = new EmbedBuilder()
          .setColor(GOLD)
          .setTitle(`👤 ${player.attributes.name} — Playtime (last 10 days)`)
          .addFields(
            { name: '⏱️ Total', value: `${totalHrs} hrs`, inline: true },
            { name: '📅 Daily Average', value: `${avgHrs} hrs/day`, inline: true },
            { name: '\u200b', value: '\u200b', inline: true },
            { name: 'Top Days', value: topDays || 'No sessions found', inline: false },
            { name: 'First Seen', value: firstSeen, inline: true },
            { name: 'Last Seen', value: lastSeen, inline: true },
          )
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }

      // All tracked players — compact list
      if (showAll) {
        const list = data.tracker.tracked;
        if (!list.length) return interaction.editReply('No players are being tracked.');

        const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
        const lines = [];

        for (const entry of list) {
          try {
            const sessions = await bm.getPlayerRecentSessions(entry.bmPlayerId, 50);
            const recent = sessions.filter(s => new Date(s.attributes.start).getTime() > tenDaysAgo);
            let totalMs = 0;
            for (const s of recent) {
              const start = new Date(s.attributes.start).getTime();
              const stop = s.attributes.stop ? new Date(s.attributes.stop).getTime() : Date.now();
              totalMs += stop - start;
            }
            const hrs = (totalMs / 3600000).toFixed(1);
            lines.push(`**${entry.name}** — ${hrs} hrs`);
          } catch {
            lines.push(`**${entry.name}** — error`);
          }
        }

        const embed = new EmbedBuilder()
          .setColor(GOLD)
          .setTitle('⏱️ Playtime — All Tracked Players (last 10 days)')
          .setDescription(lines.join('\n'))
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }

      return interaction.editReply('❌ Provide a `player-id` for individual stats, or set `all: True` for all tracked players.');
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

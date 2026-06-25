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
        .addStringOption((opt) =>
          opt.setName('server-id').setDescription('Only alert when the player is on this BattleMetrics server ID').setRequired(false)
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
        .setDescription('Track up to 50 players at once by pasting Steam IDs or BattleMetrics links')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Channel to send alerts to')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName('server-id').setDescription('Only alert when players join this BattleMetrics server ID').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('hours')
        .setDescription('Show how many hours a player has on each server by Steam ID')
        .addStringOption((opt) =>
          opt.setName('steam-id').setDescription('Steam ID (steamID64)').setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName('server').setDescription('Filter to a specific server (name or BM ID)').setRequired(false)
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
      const serverId = interaction.options.getString('server-id');

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

      let filterServerName = null;
      if (serverId) {
        try {
          const sv = await bm.getServer(serverId);
          filterServerName = sv.attributes.name;
        } catch {
          return interaction.editReply(`❌ Could not find a server with ID \`${serverId}\`. Use \`/bm server\` to find the right ID.`);
        }
      }

      const entry = {
        bmPlayerId: playerId,
        name: player.attributes.name,
        alertChannelId: channel.id,
        filterServerId: serverId || null,
        filterServerName,
        lastServerId: null,
        lastServerName: null,
        online: false,
        addedBy: interaction.user.id,
      };

      data.tracker.tracked.push(entry);
      saveGuildData(guildId, data);

      const where = serverId ? ` — only when on **${filterServerName}**` : '';
      return interaction.editReply(`✅ Now tracking **${player.attributes.name}**${where}. Alerts will be sent to ${channel}.`);
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
        .setLabel('SteamID or BM link + name — 1/line (max 50)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('76561198000000000 John\nbattlemetrics.com/players/123456789 Sarah\n76561198000000002 (name optional)')
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (sub === 'hours') {
      await interaction.deferReply();
      const steamId = interaction.options.getString('steam-id').trim();
      const serverFilter = interaction.options.getString('server');

      if (!/^\d{17}$/.test(steamId)) {
        return interaction.editReply('❌ That doesn\'t look like a valid Steam ID. Use the 17-digit steamID64 (e.g. `76561198000000000`).');
      }

      let player;
      try {
        player = await bm.getPlayerBySteamId(steamId);
      } catch (err) {
        if (err.response?.status === 401) {
          return interaction.editReply('❌ A BattleMetrics API token is required. Set `BATTLEMETRICS_TOKEN` in your secrets.');
        }
        return interaction.editReply('❌ Failed to reach BattleMetrics API.');
      }

      if (!player) {
        return interaction.editReply(`❌ No Rust player found for Steam ID \`${steamId}\`.`);
      }

      let servers;
      try {
        servers = await bm.getPlayerServerPlaytime(player.id);
      } catch (err) {
        if (err.response?.status === 401) {
          return interaction.editReply('❌ A BattleMetrics API token is required. Set `BATTLEMETRICS_TOKEN` in your secrets.');
        }
        return interaction.editReply('❌ Failed to fetch playtime data.');
      }

      if (serverFilter) {
        const f = serverFilter.toLowerCase();
        servers = servers.filter((s) => s.id === serverFilter || (s.name && s.name.toLowerCase().includes(f)));
      }

      const top = servers.slice(0, serverFilter ? 10 : 8);
      await Promise.all(
        top.map(async (s) => {
          if (!s.name) {
            try {
              const sv = await bm.getServer(s.id);
              s.name = sv.attributes.name;
            } catch {
              s.name = `Server ${s.id}`;
            }
          }
        })
      );

      const fmtH = (sec) => (sec / 3600).toFixed(1);

      const embed = new EmbedBuilder()
        .setColor(GOLD)
        .setTitle(`⏱️ Playtime — ${player.attributes.name}`)
        .setURL(`https://www.battlemetrics.com/players/${player.id}`)
        .setTimestamp();

      if (!top.length) {
        embed.setDescription(
          serverFilter
            ? `No matching server found for **${player.attributes.name}** (filter: "${serverFilter}").`
            : 'No server playtime found for this player.'
        );
      } else {
        const totalSec = servers.reduce((acc, s) => acc + s.timePlayed, 0);
        embed.setDescription(`Steam ID: \`${steamId}\`\nTotal tracked playtime: **${fmtH(totalSec)} h**`);
        for (const s of top) {
          embed.addFields({
            name: `${s.online ? '🟢' : '🔴'} ${s.name}`,
            value: `**${fmtH(s.timePlayed)} hours** · Last seen: ${s.lastSeen ? `<t:${Math.floor(new Date(s.lastSeen).getTime() / 1000)}:R>` : 'Unknown'}`,
            inline: false,
          });
        }
      }

      return interaction.editReply({ embeds: [embed] });
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
        const scope = t.filterServerId
          ? `\nServer: **${t.filterServerName || t.filterServerId}**`
          : '';
        embed.addFields({
          name: t.name,
          value: `ID: \`${t.bmPlayerId}\` · Status: ${t.online ? '🟢 Online' : '🔴 Offline'} · Alerts: <#${t.alertChannelId}>${scope}`,
          inline: false,
        });
      }

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};

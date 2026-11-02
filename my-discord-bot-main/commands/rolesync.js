const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { GOLD } = require('../theme');
const { getGuildData, saveGuildData } = require('../utils/storage');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rolesync')
    .setDescription('Mirror a role from your private server onto your public server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName('source').setDescription('Run in your PRIVATE server: set the role to watch and which public server to sync to')
        .addRoleOption((opt) => opt.setName('role').setDescription('The role in this server (e.g. Rise)').setRequired(true))
        .addStringOption((opt) => opt.setName('public-server-id').setDescription('The ID of your public server').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub.setName('target').setDescription('Run in your PUBLIC server: set the role that gets granted here')
        .addRoleOption((opt) => opt.setName('role').setDescription('The role to grant in this server').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub.setName('run').setDescription('Run in your PRIVATE server: sync everyone right now')
    )
    .addSubcommand((sub) =>
      sub.setName('status').setDescription('View the role sync configuration for this server')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const data = getGuildData(guildId);
    if (!data.rolesync) data.rolesync = { sourceRoleId: null, targetGuildId: null, targetRoleId: null };

    if (sub === 'source') {
      const role = interaction.options.getRole('role');
      const publicServerId = interaction.options.getString('public-server-id').trim();

      if (publicServerId === guildId) {
        return interaction.reply({ content: '❌ The public server ID can\'t be this same server.', flags: MessageFlags.Ephemeral });
      }
      if (!interaction.client.guilds.cache.has(publicServerId)) {
        return interaction.reply({ content: `❌ The bot isn't in a server with ID \`${publicServerId}\`. Invite it there first.`, flags: MessageFlags.Ephemeral });
      }

      data.rolesync.sourceRoleId = role.id;
      data.rolesync.targetGuildId = publicServerId;
      saveGuildData(guildId, data);

      return interaction.reply({
        content: `✅ This server is now the **source**. Anyone with ${role} here will be mirrored into server \`${publicServerId}\`.\nNext: run \`/rolesync target\` in that public server, then \`/rolesync run\` back here to do the first sync.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'target') {
      const role = interaction.options.getRole('role');
      data.rolesync.targetRoleId = role.id;
      saveGuildData(guildId, data);
      return interaction.reply({ content: `✅ This server is now the **target**. Synced members will be given ${role}.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'run') {
      const cfg = data.rolesync;
      if (!cfg.sourceRoleId || !cfg.targetGuildId) {
        return interaction.reply({ content: '❌ This server isn\'t set up as a source yet. Run `/rolesync source` first.', flags: MessageFlags.Ephemeral });
      }
      const sourceRole = interaction.guild.roles.cache.get(cfg.sourceRoleId);
      if (!sourceRole) {
        return interaction.reply({ content: '❌ The configured source role no longer exists. Run `/rolesync source` again.', flags: MessageFlags.Ephemeral });
      }
      const targetGuild = interaction.client.guilds.cache.get(cfg.targetGuildId);
      if (!targetGuild) {
        return interaction.reply({ content: '❌ Can\'t find the target server. Make sure the bot is still in it.', flags: MessageFlags.Ephemeral });
      }
      const targetData = getGuildData(targetGuild.id);
      const targetRoleId = targetData.rolesync?.targetRoleId;
      if (!targetRoleId) {
        return interaction.reply({ content: '❌ The public server hasn\'t set its role yet. Run `/rolesync target` there first.', flags: MessageFlags.Ephemeral });
      }
      const targetRole = targetGuild.roles.cache.get(targetRoleId);
      if (!targetRole) {
        return interaction.reply({ content: '❌ The configured target role no longer exists over there.', flags: MessageFlags.Ephemeral });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      let sourceMembers, targetMembers;
      try {
        sourceMembers = await interaction.guild.members.fetch();
        targetMembers = await targetGuild.members.fetch();
      } catch (err) {
        return interaction.editReply('❌ Failed to fetch full member lists. Make sure "Server Members Intent" is enabled for the bot in the Discord Developer Portal.');
      }

      const shouldHave = sourceMembers.filter((m) => m.roles.cache.has(sourceRole.id));

      let added = 0, removed = 0, failed = 0;
      for (const [id] of shouldHave) {
        const targetMember = targetMembers.get(id);
        if (targetMember && !targetMember.roles.cache.has(targetRole.id)) {
          try { await targetMember.roles.add(targetRole); added++; }
          catch { failed++; }
        }
      }

      const shouldHaveIds = new Set(shouldHave.keys());
      for (const [id, member] of targetMembers) {
        if (member.roles.cache.has(targetRole.id) && !shouldHaveIds.has(id)) {
          try { await member.roles.remove(targetRole); removed++; }
          catch { failed++; }
        }
      }

      const embed = new EmbedBuilder()
        .setColor(GOLD)
        .setTitle('🔄 Role Sync Complete')
        .setDescription(`**${shouldHave.size}** members have ${sourceRole} in this server.`)
        .addFields(
          { name: 'Added in public', value: String(added), inline: true },
          { name: 'Removed in public', value: String(removed), inline: true },
          { name: 'Failed', value: String(failed), inline: true },
        )
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'status') {
      const cfg = data.rolesync;
      const embed = new EmbedBuilder()
        .setColor(GOLD)
        .setTitle('🔄 Role Sync Status — This Server')
        .addFields(
          { name: 'Source role (watched here)', value: cfg.sourceRoleId ? `<@&${cfg.sourceRoleId}>` : 'Not set', inline: false },
          { name: 'Mirrors into server', value: cfg.targetGuildId ? `\`${cfg.targetGuildId}\`` : 'Not set', inline: false },
          { name: 'Target role (granted here)', value: cfg.targetRoleId ? `<@&${cfg.targetRoleId}>` : 'Not set', inline: false },
        )
        .setFooter({ text: 'A server can be a source, a target, or both.' })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};

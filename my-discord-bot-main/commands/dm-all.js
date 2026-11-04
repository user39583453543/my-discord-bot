const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require('discord.js');

// Gap between DMs. Sending too fast makes Discord flag the bot as spam,
// so keep this at 1.5s or more.
const DELAY_MS = 1500;
const ACCENT = 0xff6a1a;
const running = new Map(); // guildId -> { stop: boolean }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildDm(guild, text, imageUrl) {
  const embed = new EmbedBuilder()
    .setColor(ACCENT)
    .setAuthor({ name: guild.name, iconURL: guild.iconURL() ?? undefined })
    .setDescription(text)
    .setFooter({ text: `Sent from ${guild.name}` })
    .setTimestamp();
  if (imageUrl) embed.setImage(imageUrl);
  return { embeds: [embed] };
}

function progressText(done, total, sent, failed, status) {
  const pct = total ? Math.round((done / total) * 100) : 100;
  const filled = Math.round(pct / 5);
  const bar = '▰'.repeat(filled) + '▱'.repeat(20 - filled);
  return `${status}\n\`${bar}\` **${pct}%** (${done}/${total})\n✅ Sent: **${sent}** · 🔒 DMs closed / failed: **${failed}**`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dm-all')
    .setDescription('DM a message to everyone in the server (admins only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt.setName('message').setDescription('The message to send (use \\n for a new line)').setRequired(true).setMaxLength(4000),
    )
    .addRoleOption((opt) =>
      opt.setName('role').setDescription('Only DM people with this role (leave empty for everyone)').setRequired(false),
    )
    .addAttachmentOption((opt) =>
      opt.setName('image').setDescription('Optional image to include').setRequired(false),
    ),

  async execute(interaction) {
    const guild = interaction.guild;

    if (running.has(guild.id)) {
      return interaction.reply({ content: '⏳ A DM blast is already running in this server. Wait for it to finish or press **Stop** on it.', flags: MessageFlags.Ephemeral });
    }

    const text = interaction.options.getString('message').replace(/\\n/g, '\n');
    const role = interaction.options.getRole('role');
    const image = interaction.options.getAttachment('image');
    if (image && image.contentType && !image.contentType.startsWith('image/')) {
      return interaction.reply({ content: '❌ That attachment isn\'t an image.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Needs the Server Members intent (already on for this bot).
    const members = await guild.members.fetch();
    const targets = [...members.values()].filter(
      (m) => !m.user.bot && (!role || m.roles.cache.has(role.id)),
    );

    if (!targets.length) {
      return interaction.editReply({ content: '❌ Nobody to DM with those settings.' });
    }

    const minutes = Math.ceil((targets.length * DELAY_MS) / 60000);
    const preview = buildDm(guild, text, image?.url);
    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dmall_confirm').setLabel(`Send to ${targets.length}`).setEmoji('📨').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('dmall_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
    );

    const msg = await interaction.editReply({
      content:
        `**Preview** below. This will DM **${targets.length}** member(s)` +
        `${role ? ` with the **${role.name}** role` : ''} and take about **${minutes} min**.\n` +
        '-# People with DMs from server members turned off won\'t get it.',
      embeds: preview.embeds,
      components: [confirmRow],
    });

    let choice;
    try {
      choice = await msg.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === interaction.user.id,
        time: 120_000,
      });
    } catch {
      return interaction.editReply({ content: '⌛ Timed out, nothing was sent.', embeds: [], components: [] });
    }

    if (choice.customId === 'dmall_cancel') {
      return choice.update({ content: '❌ Cancelled, nothing was sent.', embeds: [], components: [] });
    }

    // ---- send ----
    const state = { stop: false };
    running.set(guild.id, state);

    const stopRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dmall_stop').setLabel('Stop').setEmoji('⛔').setStyle(ButtonStyle.Danger),
    );
    await choice.update({ content: progressText(0, targets.length, 0, 0, '📨 Sending…'), embeds: [], components: [stopRow] });

    const stopCollector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: (i) => i.customId === 'dmall_stop' && i.user.id === interaction.user.id,
    });
    stopCollector.on('collect', async (i) => {
      state.stop = true;
      await i.deferUpdate().catch(() => {});
    });

    let sent = 0;
    let failed = 0;
    let done = 0;
    let lastEdit = 0;

    for (const member of targets) {
      if (state.stop) break;
      try {
        await member.send(preview);
        sent++;
      } catch {
        failed++; // DMs closed, blocked the bot, etc.
      }
      done++;

      // Progress update every ~10s (the reply can only be edited for 15 min, so errors are ignored).
      if (Date.now() - lastEdit > 10_000) {
        lastEdit = Date.now();
        interaction.editReply({ content: progressText(done, targets.length, sent, failed, '📨 Sending…') }).catch(() => {});
      }
      if (done < targets.length) await sleep(DELAY_MS);
    }

    stopCollector.stop();
    running.delete(guild.id);

    const status = state.stop ? '⛔ Stopped.' : '✅ Done!';
    const summary = progressText(done, targets.length, sent, failed, status);
    await interaction.editReply({ content: summary, components: [] }).catch(() => {});
    // Long runs outlast the 15-min edit window, so also DM the summary to whoever ran it.
    await interaction.user.send(`**DM blast in ${guild.name}**\n${summary}`).catch(() => {});
  },
};

const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType,
} = require('discord.js');
const { GOLD } = require('../theme');
const { getGuildData, saveGuildData } = require('../utils/storage');

const FIELD_LIMIT = 1024;
const MSG_LINK_RE = /discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)/i;

function findMember(data, name) {
  const key = name.trim().toLowerCase();
  return data.vip.members.find((m) => m.name.toLowerCase() === key);
}

async function resolveLogChannel(interaction, data) {
  if (data.vip.logChannelId) {
    try {
      const ch = await interaction.guild.channels.fetch(data.vip.logChannelId);
      if (ch) return ch;
    } catch {
      // fall through to current channel
    }
  }
  return interaction.channel;
}

// Given either an attachment or a pasted link (direct image URL or a Discord
// message link), resolve down to a direct image URL we can embed right now.
async function resolveImageUrl(interaction, attachment, link) {
  if (attachment) {
    if (attachment.contentType && !attachment.contentType.startsWith('image/')) {
      return { error: 'That attachment doesn\'t look like an image.' };
    }
    return { url: attachment.url };
  }

  const trimmed = link.trim();
  const msgLinkMatch = trimmed.match(MSG_LINK_RE);
  if (msgLinkMatch) {
    const [, guildId, channelId, messageId] = msgLinkMatch;
    if (guildId !== interaction.guild.id) {
      return { error: 'That message link is from a different server.' };
    }
    try {
      const channel = await interaction.guild.channels.fetch(channelId);
      const msg = await channel.messages.fetch(messageId);
      const imgAttachment = [...msg.attachments.values()].find((a) => a.contentType?.startsWith('image/'));
      const embedImage = msg.embeds.find((e) => e.image)?.image?.url;
      const url = imgAttachment?.url || embedImage;
      if (!url) return { error: 'Couldn\'t find an image on that message.' };
      return { url };
    } catch {
      return { error: 'Couldn\'t fetch that message. Make sure the link is correct and the bot can see that channel.' };
    }
  }

  return { url: trimmed };
}

function buildListEmbed(data) {
  const members = data.vip.members;
  const embed = new EmbedBuilder()
    .setColor(GOLD)
    .setTitle('✅ VIP Proof Status')
    .setTimestamp();

  if (!members.length) {
    embed.setDescription('No one is being tracked yet. Use `/vip add` or `/vip roster add` to start.');
    return embed;
  }

  const confirmed = members.filter((m) => m.messageId).length;
  embed.setDescription(`**${confirmed}/${members.length}** confirmed with proof.`);

  const lines = members.map((m, i) => `**${i + 1}.** ${m.name} — ${m.messageId ? '✅' : '❌'}`);

  let chunk = '';
  for (const line of lines) {
    const piece = line + '\n';
    if ((chunk + piece).length > FIELD_LIMIT) {
      embed.addFields({ name: '\u200b', value: chunk, inline: false });
      chunk = '';
    }
    chunk += piece;
  }
  if (chunk) embed.addFields({ name: '\u200b', value: chunk, inline: false });

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vip')
    .setDescription('Track VIP proof screenshots for the team')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName('add').setDescription('Add or update someone\'s VIP proof')
        .addStringOption((opt) => opt.setName('name').setDescription('Their name').setRequired(true))
        .addAttachmentOption((opt) => opt.setName('image').setDescription('Screenshot of their VIP proof').setRequired(false))
        .addStringOption((opt) => opt.setName('link').setDescription('A Discord image link or message link (use instead of uploading)').setRequired(false))
    )
    .addSubcommand((sub) =>
      sub.setName('remove').setDescription('Remove someone from the VIP list entirely')
        .addStringOption((opt) => opt.setName('name').setDescription('Their name').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('Show everyone tracked and whether they have proof on file')
    )
    .addSubcommand((sub) =>
      sub.setName('proof').setDescription('View a specific person\'s proof screenshot (only visible to you)')
        .addStringOption((opt) => opt.setName('name').setDescription('Their name').setRequired(true))
    )
    .addSubcommandGroup((group) =>
      group.setName('roster').setDescription('Manage names on the VIP tracking list')
        .addSubcommand((sub) =>
          sub.setName('add').setDescription('Add a name to the list with no proof yet')
            .addStringOption((opt) => opt.setName('name').setDescription('Their name').setRequired(true))
        )
        .addSubcommand((sub) =>
          sub.setName('remove').setDescription('Remove a name from the list')
            .addStringOption((opt) => opt.setName('name').setDescription('Their name').setRequired(true))
        )
    )
    .addSubcommandGroup((group) =>
      group.setName('config').setDescription('Configure the VIP proof system')
        .addSubcommand((sub) =>
          sub.setName('channel').setDescription('Set the channel where proof screenshots are archived')
            .addChannelOption((opt) =>
              opt.setName('channel').setDescription('Archive channel').addChannelTypes(ChannelType.GuildText).setRequired(true)
            )
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const group = interaction.options.getSubcommandGroup(false);
    const guildId = interaction.guild.id;
    const data = getGuildData(guildId);
    if (!data.vip) data.vip = { logChannelId: null, members: [] };

    if (group === 'config' && sub === 'channel') {
      const channel = interaction.options.getChannel('channel');
      data.vip.logChannelId = channel.id;
      saveGuildData(guildId, data);
      return interaction.reply({ content: `✅ VIP proof screenshots will now be archived in ${channel}.`, flags: MessageFlags.Ephemeral });
    }

    if (group === 'roster' && sub === 'add') {
      const name = interaction.options.getString('name').trim();
      if (findMember(data, name)) {
        return interaction.reply({ content: `⚠️ **${name}** is already on the list.`, flags: MessageFlags.Ephemeral });
      }
      data.vip.members.push({ name, channelId: null, messageId: null, addedBy: interaction.user.id, addedAt: Date.now() });
      saveGuildData(guildId, data);
      return interaction.reply({ content: `✅ Added **${name}** to the list (no proof yet — ❌).`, flags: MessageFlags.Ephemeral });
    }

    if (group === 'roster' && sub === 'remove') {
      const name = interaction.options.getString('name').trim();
      const before = data.vip.members.length;
      data.vip.members = data.vip.members.filter((m) => m.name.toLowerCase() !== name.toLowerCase());
      if (data.vip.members.length === before) {
        return interaction.reply({ content: `❌ Couldn't find **${name}** on the list.`, flags: MessageFlags.Ephemeral });
      }
      saveGuildData(guildId, data);
      return interaction.reply({ content: `✅ Removed **${name}** from the list.`, flags: MessageFlags.Ephemeral });
    }

    if (!group && sub === 'add') {
      const name = interaction.options.getString('name').trim();
      const attachment = interaction.options.getAttachment('image');
      const link = interaction.options.getString('link');

      if (!attachment && !link) {
        return interaction.reply({ content: '❌ Attach an image or paste a link.', flags: MessageFlags.Ephemeral });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const resolved = await resolveImageUrl(interaction, attachment, link);
      if (resolved.error) return interaction.editReply(`❌ ${resolved.error}`);

      const logChannel = await resolveLogChannel(interaction, data);
      let sentMsg;
      try {
        const proofEmbed = new EmbedBuilder()
          .setColor(GOLD)
          .setTitle('VIP Proof')
          .setDescription(`**${name}**`)
          .setImage(resolved.url)
          .setFooter({ text: `Added by ${interaction.user.tag}` })
          .setTimestamp();
        sentMsg = await logChannel.send({ embeds: [proofEmbed] });
      } catch (err) {
        return interaction.editReply('❌ Failed to archive that image. Make sure the bot can send messages in the archive channel.');
      }

      const existing = findMember(data, name);
      if (existing) {
        existing.channelId = logChannel.id;
        existing.messageId = sentMsg.id;
        existing.addedBy = interaction.user.id;
        existing.addedAt = Date.now();
      } else {
        data.vip.members.push({
          name,
          channelId: logChannel.id,
          messageId: sentMsg.id,
          addedBy: interaction.user.id,
          addedAt: Date.now(),
        });
      }
      saveGuildData(guildId, data);

      return interaction.editReply(`✅ Proof saved for **${name}**.`);
    }

    if (!group && sub === 'remove') {
      const name = interaction.options.getString('name').trim();
      const before = data.vip.members.length;
      data.vip.members = data.vip.members.filter((m) => m.name.toLowerCase() !== name.toLowerCase());
      if (data.vip.members.length === before) {
        return interaction.reply({ content: `❌ Couldn't find **${name}** on the list.`, flags: MessageFlags.Ephemeral });
      }
      saveGuildData(guildId, data);
      return interaction.reply({ content: `✅ Removed **${name}** from the list.`, flags: MessageFlags.Ephemeral });
    }

    if (!group && sub === 'list') {
      const embed = buildListEmbed(data);
      return interaction.reply({ embeds: [embed] });
    }

    if (!group && sub === 'proof') {
      const name = interaction.options.getString('name').trim();
      const member = findMember(data, name);
      if (!member) {
        return interaction.reply({ content: `❌ Couldn't find **${name}** on the list.`, flags: MessageFlags.Ephemeral });
      }
      if (!member.messageId) {
        return interaction.reply({ content: `❌ **${member.name}** has no proof on file yet.`, flags: MessageFlags.Ephemeral });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        const channel = await interaction.guild.channels.fetch(member.channelId);
        const msg = await channel.messages.fetch(member.messageId);
        const imgAttachment = [...msg.attachments.values()].find((a) => a.contentType?.startsWith('image/'));
        const embedImage = msg.embeds.find((e) => e.image)?.image?.url;
        const url = imgAttachment?.url || embedImage;
        if (!url) return interaction.editReply(`❌ Couldn't find the stored image for **${member.name}** — it may have been deleted from the archive channel.`);

        const embed = new EmbedBuilder()
          .setColor(GOLD)
          .setTitle(`VIP Proof — ${member.name}`)
          .setImage(url)
          .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      } catch {
        return interaction.editReply(`❌ Couldn't retrieve the stored proof for **${member.name}** — the archive message or channel may have been deleted.`);
      }
    }
  },
};

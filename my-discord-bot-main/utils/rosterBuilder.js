const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { GOLD, DIVIDER } = require('../theme');

const ROLE_RANK = {
  'founder': 0, 'co-founder': 1, 'officer': 2, 'core': 3,
  'support': 4, 'member': 5, 'trial': 6,
};

function getRoleRank(role) {
  return ROLE_RANK[role.toLowerCase()] ?? 99;
}

function buildRosterEmbed(data) {
  const title = data.roster.title || 'TEAM ROSTER';
  const embed = new EmbedBuilder()
    .setColor(GOLD)
    .setTitle(`${title.toUpperCase()} — ROSTER`)
    .setFooter({ text: `${title} · ${data.roster.members.length} member${data.roster.members.length !== 1 ? 's' : ''}` });

  if (data.roster.members.length === 0) {
    embed.setDescription(`\`${DIVIDER}\`\n\n_No members added yet. Use \`/roster add\` to add members._\n\n\`${DIVIDER}\``);
    return embed;
  }

  const grouped = {};
  for (const m of data.roster.members) {
    const key = m.role.toUpperCase();
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(m);
  }

  const sortedRoles = Object.keys(grouped).sort((a, b) => getRoleRank(a) - getRoleRank(b));

  const sections = sortedRoles.map((role) => {
    const members = grouped[role];
    const lines = members.map((m, i) => {
      const connector = i === members.length - 1 ? '╚' : '╠';
      const prefix = m.emoji ? `${m.emoji} ` : '';
      return `${connector} ${prefix}<@${m.userId}>`;
    });
    return `**${role}**\n${lines.join('\n')}`;
  });

  embed.setDescription(`\`${DIVIDER}\`\n\n${sections.join('\n\n')}\n\n\`${DIVIDER}\``);
  return embed;
}

function buildLinkButtons(data) {
  const buttons = [];
  if (data.links.discord) {
    buttons.push(new ButtonBuilder().setLabel('DISCORD').setStyle(ButtonStyle.Link).setURL(data.links.discord));
  }
  if (data.links.telegram) {
    buttons.push(new ButtonBuilder().setLabel('TELEGRAM').setStyle(ButtonStyle.Link).setURL(data.links.telegram));
  }
  if (data.links.youtube) {
    buttons.push(new ButtonBuilder().setLabel('YOUTUBE').setStyle(ButtonStyle.Link).setURL(data.links.youtube));
  }
  if (buttons.length === 0) return [];
  return [new ActionRowBuilder().addComponents(...buttons)];
}

module.exports = { buildRosterEmbed, buildLinkButtons };

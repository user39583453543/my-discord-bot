const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { GOLD, DIVIDER } = require("../theme");

function buildRosterEmbed(data) {
  const title = data.roster.title || "TEAM ROSTER";

  let description = `\`${DIVIDER}\`\n● **LIST OF PLAYERS:**\n\n`;

  if (data.roster.members.length === 0) {
    description += "_No members added yet. Use `/roster add` to add members._";
  } else {
    description += data.roster.members
      .map((m) => {
        const prefix = m.emoji ? `${m.emoji} ` : "";
        return `${prefix}<@${m.userId}> - **${m.role.toUpperCase()}**`;
      })
      .join("\n");
  }

  const embed = new EmbedBuilder()
    .setColor(GOLD)
    .setTitle(`${title.toUpperCase()} ROSTER`)
    .setDescription(description)
    .setFooter({ text: title });

  return embed;
}

function buildLinkButtons(data) {
  const buttons = [];

  if (data.links.discord) {
    buttons.push(
      new ButtonBuilder()
        .setLabel("DISCORD")
        .setStyle(ButtonStyle.Link)
        .setURL(data.links.discord),
    );
  }
  if (data.links.telegram) {
    buttons.push(
      new ButtonBuilder()
        .setLabel("TELEGRAM")
        .setStyle(ButtonStyle.Link)
        .setURL(data.links.telegram),
    );
  }
  if (data.links.youtube) {
    buttons.push(
      new ButtonBuilder()
        .setLabel("YOUTUBE")
        .setStyle(ButtonStyle.Link)
        .setURL(data.links.youtube),
    );
  }

  if (buttons.length === 0) return [];

  return [new ActionRowBuilder().addComponents(...buttons)];
}

module.exports = { buildRosterEmbed, buildLinkButtons };

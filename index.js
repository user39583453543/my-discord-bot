require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');

http.createServer((_, res) => res.end('OK')).listen(process.env.PORT || 3000);
const { Client, GatewayIntentBits, Collection, MessageFlags } = require('discord.js');
const {
  showTicketModal,
  handleModalSubmit,
  claimTicket,
  closeTicket,
  handleCloseModal,
  declineTicket,
  handleDeclineModal,
  acceptTicket,
} = require('./utils/ticketManager');
const tracker = require('./utils/playerTracker');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
  tracker.start(client);
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      return await command.execute(interaction);
    }

    if (interaction.isButton()) {
      const { customId } = interaction;
      if (customId === 'ticket_open') return await showTicketModal(interaction, null);
      if (customId.startsWith('ticket_open:')) return await showTicketModal(interaction, customId.slice('ticket_open:'.length));
      if (customId === 'ticket_claim') return await claimTicket(interaction);
      if (customId === 'ticket_close') return await closeTicket(interaction);
      if (customId === 'ticket_accept') return await acceptTicket(interaction);
      if (customId === 'ticket_decline') return await declineTicket(interaction);
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'ticket_modal' || interaction.customId.startsWith('ticket_modal:')) {
        return await handleModalSubmit(interaction);
      }
      if (interaction.customId === 'ticket_close_modal') {
        return await handleCloseModal(interaction);
      }
      if (interaction.customId === 'ticket_decline_modal') {
        return await handleDeclineModal(interaction);
      }
      if (interaction.customId.startsWith('bm_bulktrack_modal:')) {
        const channelId = interaction.customId.split(':')[1];
        const rawInput = interaction.fields.getTextInputValue('steam_ids');
        const steamIds = rawInput.split(/[\n,]+/).map(s => s.trim()).filter(s => /^\d{15,20}$/.test(s)).slice(0, 50);

        if (!steamIds.length) {
          return interaction.reply({ content: '❌ No valid Steam IDs found. Make sure each is on its own line.', flags: MessageFlags.Ephemeral });
        }

        await interaction.reply({ content: `🔍 Looking up ${steamIds.length} Steam ID(s)… this may take a moment.`, flags: MessageFlags.Ephemeral });

        const { getPlayerBySteamId } = require('./utils/battlemetrics');
        const { getGuildData, saveGuildData } = require('./utils/storage');
        const data = getGuildData(interaction.guild.id);
        if (!data.tracker) data.tracker = { tracked: [] };

        let added = 0, skipped = 0, failed = 0;
        const results = [];

        for (const steamId of steamIds) {
          try {
            const player = await getPlayerBySteamId(steamId);
            if (!player) { failed++; results.push(`❓ \`${steamId}\` — not found`); continue; }
            const bmId = player.id;
            if (data.tracker.tracked.find(t => t.bmPlayerId === bmId)) {
              skipped++;
              results.push(`⚠️ **${player.attributes.name}** — already tracked`);
              continue;
            }
            data.tracker.tracked.push({
              bmPlayerId: bmId,
              name: player.attributes.name,
              alertChannelId: channelId,
              lastServerId: null,
              lastServerName: null,
              online: false,
              addedBy: interaction.user.id,
            });
            added++;
            results.push(`✅ **${player.attributes.name}**`);
          } catch {
            failed++;
            results.push(`❌ \`${steamId}\` — error`);
          }
        }

        saveGuildData(interaction.guild.id, data);

        const summary = `**${added} added · ${skipped} already tracked · ${failed} failed**\n\n${results.join('\n')}`.slice(0, 1900);
        return interaction.editReply({ content: summary });
      }
    }
  } catch (error) {
    console.error(error);
    const msg = { content: 'Something went wrong.', flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(msg).catch(() => {});
    } else {
      await interaction.reply(msg).catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);

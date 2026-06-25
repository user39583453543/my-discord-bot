require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');

// Keepalive HTTP server for Replit
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
  holdTicket,
  refreshTicketPanels,
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
  console.log(`[Bot] Logged in as ${client.user.tag}`);
  tracker.start(client);
  refreshTicketPanels(client).catch((err) => console.error('[Bot] Failed to refresh ticket panels:', err));
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
      if (customId === 'ticket_hold') return await holdTicket(interaction);
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
        const parts = interaction.customId.split(':');
        const channelId = parts[1];
        const serverId = parts[2] || null;
        const rawInput = interaction.fields.getTextInputValue('steam_ids');
        const steamIds = rawInput
          .split(/\n+/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const urlMatch = line.match(/(?:https?:\/\/)?(?:www\.)?battlemetrics\.com\/players\/(\d+)/i);
            const steamMatch = line.match(/7656\d{13}/) || line.match(/\b\d{17}\b/);
            let bmId = null, steamId = null, removed = null;
            if (urlMatch) {
              bmId = urlMatch[1];
              removed = urlMatch[0];
            } else if (steamMatch) {
              steamId = steamMatch[0];
              removed = steamId;
            } else {
              const bareBm = line.match(/\b\d{5,12}\b/);
              if (bareBm) { bmId = bareBm[0]; removed = bareBm[0]; }
            }
            if (!bmId && !steamId) return null;
            const discordName = line
              .replace(removed, ' ')
              .replace(/(?:https?:\/\/)?\S*(?:steamcommunity\.com|battlemetrics\.com)\S*/gi, ' ')
              .replace(/https?:\/\/\S+/gi, ' ')
              .replace(/[,]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .replace(/^[\s\-–—:|]+|[\s\-–—:|]+$/g, '')
              .trim()
              .slice(0, 50);
            return { steamId, bmId, discordName: discordName || null };
          })
          .filter(Boolean);

        if (!steamIds.length) {
          return interaction.reply({ content: '❌ No valid Steam IDs or BattleMetrics links found. Make sure each is on its own line.', flags: MessageFlags.Ephemeral });
        }

        const { getGuildData, saveGuildData } = require('./utils/storage');
        const data = getGuildData(interaction.guild.id);
        if (!data.tracker) data.tracker = { tracked: [] };

        // No BattleMetrics lookup — just store Steam ID + name instantly
        let added = 0, skipped = 0;
        const results = [];

        for (const { steamId, bmId: inputBmId, discordName } of steamIds) {
          const key = steamId || inputBmId;
          const label = discordName || key;
          const existing = data.tracker.tracked.find(t =>
            (steamId && t.steamId === steamId) || (inputBmId && !steamId && t.bmPlayerId === inputBmId)
          );
          if (existing) {
            skipped++;
            results.push(`⚠️ **${existing.discordName || existing.name || key}** — already tracked`);
            continue;
          }
          data.tracker.tracked.push({
            steamId: steamId || null,
            bmPlayerId: inputBmId || null,
            name: discordName || steamId || inputBmId,
            discordName: discordName || null,
            alertChannelId: channelId,
            filterServerId: serverId || null,
            filterServerName: serverId ? `Server ${serverId}` : null,
            lastServerId: null,
            lastServerName: null,
            online: false,
            addedBy: interaction.user.id,
          });
          added++;
          results.push(`✅ **${label}**`);
        }

        saveGuildData(interaction.guild.id, data);

        const counts = `**${added} added · ${skipped} already tracked**`;
        const header = serverId ? `${counts}\nAlerting only when on server \`${serverId}\`\n` : `${counts}\n`;
        const summary = `${header}\n${results.join('\n')}`.slice(0, 1900);
        return interaction.reply({ content: summary, flags: MessageFlags.Ephemeral });
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

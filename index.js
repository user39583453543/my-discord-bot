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
  console.log(`Logged in as ${client.user.tag}`);
  tracker.start(client);
  refreshTicketPanels(client).catch((err) => console.error('Failed to refresh ticket panels:', err));
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
          .filter(Boolean)
          .slice(0, 50);

        if (!steamIds.length) {
          return interaction.reply({ content: '❌ No valid Steam IDs or BattleMetrics links found. Make sure each is on its own line.', flags: MessageFlags.Ephemeral });
        }

        await interaction.reply({ content: `🔍 Looking up ${steamIds.length} player(s)… this may take a moment.`, flags: MessageFlags.Ephemeral });

        const { getPlayerBySteamId, getPlayerById, getServer } = require('./utils/battlemetrics');
        const { getGuildData, saveGuildData } = require('./utils/storage');
        const data = getGuildData(interaction.guild.id);
        if (!data.tracker) data.tracker = { tracked: [] };

        let filterServerName = null;
        if (serverId) {
          try {
            const sv = await getServer(serverId);
            filterServerName = sv.attributes.name;
          } catch {
            return interaction.editReply(`❌ Could not find a server with ID \`${serverId}\`. Use \`/bm server\` to find the right ID, then try again.`);
          }
        }

        let added = 0, skipped = 0, failed = 0, updated = 0, duplicate = 0;
        const results = [];
        const seenThisBatch = new Map();

        for (const { steamId, bmId: inputBmId, discordName } of steamIds) {
          const idLabel = inputBmId || steamId;
          try {
            const player = inputBmId ? await getPlayerById(inputBmId) : await getPlayerBySteamId(steamId);
            if (!player) { failed++; results.push(`❓ \`${idLabel}\` — not found`); continue; }
            const bmId = player.id;
            const tag = discordName ? ` (${discordName})` : '';
            if (seenThisBatch.has(bmId)) {
              duplicate++;
              results.push(`♻️ ${discordName || `\`${idLabel}\``} — same in-game player as **${player.attributes.name}** (already in this list)`);
              continue;
            }
            seenThisBatch.set(bmId, player.attributes.name);
            const existing = data.tracker.tracked.find(t => t.bmPlayerId === bmId);
            if (existing) {
              let didUpdate = false;
              if (serverId && existing.filterServerId !== serverId) {
                existing.filterServerId = serverId;
                existing.filterServerName = filterServerName;
                existing.alertChannelId = channelId;
                existing.wipeStart = null;
                existing.wipeMs = 0;
                existing.lastTickAt = null;
                didUpdate = true;
              }
              if (discordName && existing.discordName !== discordName) {
                existing.discordName = discordName;
                didUpdate = true;
              }
              if (didUpdate) {
                updated++;
                results.push(`🔄 **${existing.name}**${tag} — updated`);
              } else {
                skipped++;
                results.push(`⚠️ **${player.attributes.name}** — already tracked`);
              }
              continue;
            }
            data.tracker.tracked.push({
              bmPlayerId: bmId,
              name: player.attributes.name,
              discordName: discordName || null,
              alertChannelId: channelId,
              filterServerId: serverId || null,
              filterServerName,
              lastServerId: null,
              lastServerName: null,
              online: false,
              addedBy: interaction.user.id,
            });
            added++;
            results.push(`✅ **${player.attributes.name}**${tag}`);
          } catch {
            failed++;
            results.push(`❌ \`${idLabel}\` — error`);
          } finally {
            await new Promise((r) => setTimeout(r, 150));
          }
        }

        saveGuildData(interaction.guild.id, data);

        const counts = `**${added} added · ${updated} updated · ${duplicate} duplicate · ${skipped} already tracked · ${failed} failed**`;
        const header = serverId
          ? `${counts}\nAlerting only when on **${filterServerName}**\n`
          : `${counts}\n`;
        const summary = `${header}\n${results.join('\n')}`.slice(0, 1900);
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

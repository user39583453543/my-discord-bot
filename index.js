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
} = require('./utils/ticketManager');
const tracker = require('./utils/playerTracker');

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
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

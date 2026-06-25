require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  commands.push(command.data.toJSON());
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

const GUILD_IDS = [
  '1506328645424250970',
  '1362098140328493246',
];

(async () => {
  try {
    console.log(`Deploying ${commands.length} commands to ${GUILD_IDS.length} guilds...`);
    for (const guildId of GUILD_IDS) {
      await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId), { body: commands });
      console.log(`✅ Deployed to guild ${guildId}`);
    }
    console.log('All done! Commands are live instantly in both servers.');
  } catch (error) {
    console.error(error);
  }
})();

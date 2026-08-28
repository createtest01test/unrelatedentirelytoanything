require('dotenv').config();
const { REST, Routes } = require('discord.js');

const commandFiles = [
  require('./commands/setwelcome'),
  require('./commands/setrole'),
  require('./commands/setconfig'),
  require('./commands/draft'),
  require('./commands/edit'),
];

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

(async () => {
  console.log('Clearing ALL guild commands from every server...');

  // Get all guilds the bot is in and clear guild commands from each
  const guilds = await rest.get(Routes.userGuilds());
  for (const guild of guilds) {
    await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, guild.id), { body: [] });
    console.log(`✅ Cleared guild commands from: ${guild.name}`);
  }

  console.log('Registering global commands...');
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
    body: commandFiles.map(c => c.data.toJSON()),
  });
  console.log('✅ Global commands registered: ' + commandFiles.map(c => c.data.name).join(', '));
})();

require('dotenv').config();
const { REST, Routes } = require('discord.js');

const MAIN_GUILD_ID  = '1480349095842283520';
const STAFF_GUILD_ID = '1494002714009665537';

const mainCommands = [
  require('./commands/setwelcome'),
  require('./commands/setrole'),
  require('./commands/setconfig'),
  require('./commands/draft'),
  require('./commands/edit'),
  require('./commands/rolelist'),
];

const staffCommands = [
  require('./commands/closeticket'),
  require('./commands/staffmode'),
];

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

(async () => {
  // Clear old global commands
  console.log('Clearing global commands...');
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [] });
  console.log('✅ Global commands cleared');

  // Register main server commands
  console.log('Registering main server commands...');
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, MAIN_GUILD_ID),
    { body: mainCommands.map(c => c.data.toJSON()) }
  );
  console.log('✅ Main server: ' + mainCommands.map(c => c.data.name).join(', '));

  // Register staff server commands
  console.log('Registering staff server commands...');
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, STAFF_GUILD_ID),
    { body: staffCommands.map(c => c.data.toJSON()) }
  );
  console.log('✅ Staff server: ' + staffCommands.map(c => c.data.name).join(', '));
})();

require('dotenv').config();
const { REST, Routes } = require('discord.js');

const TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('❌ Missing TOKEN, CLIENT_ID, or GUILD_ID');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  console.log('Clearing guild commands...');

  // Clear guild-specific commands for the given server
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });
  console.log(`✅ Cleared guild commands for server ${GUILD_ID}`);

  // Also list current global commands so you can confirm
  const global = await rest.get(Routes.applicationCommands(CLIENT_ID));
  console.log(`ℹ️ Global commands still registered: ${global.map(c => c.name).join(', ')}`);
})();

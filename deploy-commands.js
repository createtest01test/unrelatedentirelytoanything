const { REST, Routes } = require('discord.js');

const commandFiles = [
  require('./commands/send'),
  require('./commands/setwelcome'),
  require('./commands/setrole'),
  require('./commands/setconfig'),
  require('./commands/preview'),
];

async function registerCommands(client) {
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
    const guild = client.guilds.cache.first();
    if (!guild) return;

    await rest.put(
      Routes.applicationGuildCommands(client.user.id, guild.id),
      { body: commandFiles.map(c => c.data.toJSON()) }
    );
    console.log('✅ Slash commands registered');
  } catch (err) {
    console.error('Command registration error:', err);
  }
}

module.exports = { registerCommands };

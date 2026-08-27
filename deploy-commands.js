const { REST, Routes } = require('discord.js');

const commandFiles = [
  require('./commands/send'),
  require('./commands/setwelcome'),
  require('./commands/setrole'),
  require('./commands/setconfig'),
  require('./commands/preview'),
  require('./commands/draft'),
];

async function registerCommands(client) {
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(client.user.id, '1480349095842283520'),
      { body: commandFiles.map(c => c.data.toJSON()) }
    );
    console.log('✅ Slash commands registered globally');
  } catch (err) {
    console.error('Command registration error:', err);
  }
}

module.exports = { registerCommands };

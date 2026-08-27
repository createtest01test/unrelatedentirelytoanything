require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection, ActivityType } = require('discord.js');
const { loadConfig, saveConfig } = require('./config');
const { registerCommands } = require('./deploy-commands');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
  ],
  partials: [Partials.GuildMember],
});

client.commands = new Collection();

// Load command handlers
const commands = [
  require('./commands/send'),
  require('./commands/setwelcome'),
  require('./commands/setrole'),
  require('./commands/setconfig'),
  require('./commands/preview'),
  require('./commands/draft'),
];

for (const command of commands) {
  client.commands.set(command.data.name, command);
}

// ─── READY ────────────────────────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await registerCommands(client);
  updateStatus(client);
  // Refresh status every 5 minutes in case members join/leave
  setInterval(() => updateStatus(client), 5 * 60 * 1000);
});

// ─── STATUS UPDATER ───────────────────────────────────────────────────────────
async function updateStatus(client) {
  try {
    const config = await loadConfig(client);
    if (!config.statusRole || !config.statusTemplate) return;

    const guild = client.guilds.cache.first();
    if (!guild) return;

    await guild.members.fetch(); // Ensure cache is populated
    const role = guild.roles.cache.find(r => r.name === config.statusRole);
    if (!role) return;

    const count = role.members.size;
    const statusText = config.statusTemplate.replace('{count}', count).replace('{role}', config.statusRole);

    client.user.setPresence({
      activities: [{ name: statusText, type: ActivityType.Custom }],
      status: 'online',
    });

    console.log(`🔄 Status updated: ${statusText}`);
  } catch (err) {
    console.error('Status update error:', err);
  }
}

client.updateStatus = updateStatus;

// ─── NEW MEMBER WELCOME ───────────────────────────────────────────────────────
client.on('guildMemberAdd', async (member) => {
  try {
    const config = await loadConfig(client);
    if (!config.welcomeChannelId || !config.welcomeMessage) return;

    const channel = member.guild.channels.cache.get(config.welcomeChannelId);
    if (!channel) return;

    // Build the welcome message
    let content = config.welcomeMessage.replace('{user}', `<@${member.id}>`);

    const messageOptions = { content };

    // Attach image if configured
    if (config.welcomeImageUrl) {
      const { EmbedBuilder } = require('discord.js');
      const embed = new EmbedBuilder().setImage(config.welcomeImageUrl);
      messageOptions.embeds = [embed];
    }

    await channel.send(messageOptions);
    console.log(`👋 Welcome sent for ${member.user.tag}`);
  } catch (err) {
    console.error('Welcome message error:', err);
  }
});

// ─── SLASH COMMAND + MODAL HANDLER ───────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  // Handle modal submissions
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'draft_modal') {
      const draftCommand = client.commands.get('draft');
      if (draftCommand?.handleModal) {
        await draftCommand.handleModal(interaction, client);
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, client);
  } catch (err) {
    console.error(`Command error [${interaction.commandName}]:`, err);
    const msg = { content: '❌ Something went wrong running that command.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(msg);
    } else {
      await interaction.reply(msg);
    }
  }
});

client.login(process.env.BOT_TOKEN);

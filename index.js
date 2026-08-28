require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection, ActivityType } = require('discord.js');
const { loadConfig, saveConfig } = require('./config');

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
  require('./commands/setwelcome'),
  require('./commands/setrole'),
  require('./commands/setconfig'),
  require('./commands/draft'),
  require('./commands/edit'),
  require('./commands/rolelist'),
];

for (const command of commands) {
  client.commands.set(command.data.name, command);
}

// ─── READY ────────────────────────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
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

    await guild.members.fetch();
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

    let content = config.welcomeMessage.replace('{user}', `<@${member.id}>`);
    const messageOptions = { content };

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
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'draft_modal') {
      const draftCommand = client.commands.get('draft');
      if (draftCommand?.handleModal) await draftCommand.handleModal(interaction, client);
    }
    if (interaction.customId === 'edit_modal') {
      const editCommand = client.commands.get('edit');
      if (editCommand?.handleModal) await editCommand.handleModal(interaction, client);
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

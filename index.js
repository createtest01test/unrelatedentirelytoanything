require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection, ActivityType } = require('discord.js');
const { loadConfig, saveConfig } = require('./config');
const ticketManager = require('./tickets');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.GuildMember, Partials.Channel, Partials.Message],
});

client.commands = new Collection();

const commands = [
  require('./commands/setwelcome'),
  require('./commands/setrole'),
  require('./commands/setconfig'),
  require('./commands/draft'),
  require('./commands/edit'),
  require('./commands/rolelist'),
  require('./commands/closeticket'),
  require('./commands/staffmode'),
];

for (const command of commands) {
  client.commands.set(command.data.name, command);
}

// ─── READY ────────────────────────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  updateStatus(client);
  setInterval(() => updateStatus(client), 5 * 60 * 1000);
});

// ─── STATUS UPDATER ───────────────────────────────────────────────────────────
async function updateStatus(client) {
  try {
    const config = await loadConfig(client);
    if (!config.statusRole || !config.statusTemplate) return;

    const guild = client.guilds.cache.get('1480349095842283520');
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

// ─── DM HANDLER (tickets) ─────────────────────────────────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // ── Incoming DM → open/reopen ticket ──────────────────────────────────────
  if (message.channel.type === 1) { // DM channel
    console.log(`📩 DM from ${message.author.username}: ${message.content}`);
    await ticketManager.openTicket(client, message.author, message);
    return;
  }

  // ── Staff reply in ticket channel → forward to user DM ───────────────────
  const { ticketsByChannel } = ticketManager;
  if (ticketsByChannel.has(message.channel.id)) {
    await ticketManager.forwardToUser(client, message.channel.id, message.author, message);
    return;
  }

  // ── Prefix commands ────────────────────────────────────────────────────────
  if (!message.content.startsWith('!')) return;
  if (!message.member?.permissions.has('ManageMessages')) return;

  const args = message.content.slice(1).trim().split(/\s+/);
  const cmd = args[0].toLowerCase();

  if (cmd === 'rolelist') {
    const roleName = args.slice(1).join(' ').replace(/^<@&(\d+)>$/, '$1');
    if (!roleName) return message.reply('Usage: `!rolelist RoleName` or `!rolelist @Role`');

    await message.guild.members.fetch();
    const role = message.guild.roles.cache.get(roleName)
      || message.guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());

    if (!role) return message.reply(`❌ Couldn't find a role called **${roleName}**`);

    const members = role.members.map(m => m.user.username).sort();
    if (!members.length) return message.reply(`No members found with the **${role.name}** role.`);

    const chunks = [];
    let current = `**${role.name}** — ${members.length} members:\n\`\`\`\n`;
    for (const name of members) {
      if ((current + name + '\n').length > 1900) {
        current += '```';
        chunks.push(current);
        current = '```\n';
      }
      current += name + '\n';
    }
    current += '```';
    chunks.push(current);
    for (const chunk of chunks) await message.channel.send(chunk);
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

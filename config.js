/**
 * Config is stored as a pinned JSON message in your #bot-config channel.
 * Staff with access to that channel can read and the bot updates it via commands.
 */

const CONFIG_CHANNEL_ENV = 'CONFIG_CHANNEL_ID';

const defaultConfig = {
  welcomeChannelId: null,      // Channel ID for welcome messages
  welcomeMessage: 'Welcome to the server, {user}! 🎉', // {user} becomes a ping
  welcomeImageUrl: null,       // Optional image URL for welcome embed
  statusRole: null,            // Role name to count for status
  statusTemplate: 'We have {count} {role}s', // {count} and {role} are replaced
};

async function loadConfig(client) {
  try {
    const channelId = process.env[CONFIG_CHANNEL_ENV];
    if (!channelId) return { ...defaultConfig };

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return { ...defaultConfig };

    const pins = await channel.messages.fetchPinned();
    const configPin = pins.find(m => m.author.id === client.user.id && m.content.startsWith('```json'));

    if (!configPin) return { ...defaultConfig };

    const jsonMatch = configPin.content.match(/```json\n([\s\S]+?)\n```/);
    if (!jsonMatch) return { ...defaultConfig };

    return { ...defaultConfig, ...JSON.parse(jsonMatch[1]) };
  } catch (err) {
    console.error('Config load error:', err);
    return { ...defaultConfig };
  }
}

async function saveConfig(client, newConfig) {
  const channelId = process.env[CONFIG_CHANNEL_ENV];
  if (!channelId) throw new Error('CONFIG_CHANNEL_ID not set in .env');

  const channel = await client.channels.fetch(channelId);
  if (!channel) throw new Error('Config channel not found');

  const pins = await channel.messages.fetchPinned();
  const configPin = pins.find(m => m.author.id === client.user.id && m.content.startsWith('```json'));

  const content = `\`\`\`json\n${JSON.stringify(newConfig, null, 2)}\n\`\`\``;

  if (configPin) {
    await configPin.edit(content);
  } else {
    const msg = await channel.send(content);
    await msg.pin();
  }

  return newConfig;
}

module.exports = { loadConfig, saveConfig, defaultConfig };

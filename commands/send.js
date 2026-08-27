const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('send')
    .setDescription('Send a message as the bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('Channel to send the message in')
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName('message')
        .setDescription('The message content')
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName('image')
        .setDescription('Optional image URL to attach')
        .setRequired(false))
    .addStringOption(opt =>
      opt.setName('title')
        .setDescription('Optional embed title (turns message into a rich embed)')
        .setRequired(false))
    .addStringOption(opt =>
      opt.setName('color')
        .setDescription('Embed accent color as hex (e.g. #ff6b6b). Only used with title.')
        .setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.options.getChannel('channel');
    const message = interaction.options.getString('message');
    const imageUrl = interaction.options.getString('image');
    const title = interaction.options.getString('title');
    const colorHex = interaction.options.getString('color');

    const messageOptions = {};

    // If a title is provided, use an embed for richer formatting
    if (title) {
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(message);

      if (imageUrl) embed.setImage(imageUrl);
      if (colorHex) {
        const parsed = parseInt(colorHex.replace('#', ''), 16);
        if (!isNaN(parsed)) embed.setColor(parsed);
      }

      messageOptions.embeds = [embed];
    } else {
      // Plain message
      messageOptions.content = message;
      if (imageUrl) {
        const embed = new EmbedBuilder().setImage(imageUrl);
        messageOptions.embeds = [embed];
      }
    }

    try {
      await channel.send(messageOptions);
      await interaction.editReply({ content: `✅ Message sent in <#${channel.id}>` });
    } catch (err) {
      console.error(err);
      await interaction.editReply({ content: `❌ Couldn't send to that channel. Make sure I have permissions there.` });
    }
  },
};

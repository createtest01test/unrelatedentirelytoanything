const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('preview')
    .setDescription('Preview a message before sending it as the bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(opt =>
      opt.setName('message')
        .setDescription('The message to preview')
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName('image')
        .setDescription('Optional image URL')
        .setRequired(false))
    .addStringOption(opt =>
      opt.setName('title')
        .setDescription('Optional embed title')
        .setRequired(false))
    .addStringOption(opt =>
      opt.setName('color')
        .setDescription('Embed color hex (e.g. #ff6b6b)')
        .setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const message = interaction.options.getString('message');
    const imageUrl = interaction.options.getString('image');
    const title = interaction.options.getString('title');
    const colorHex = interaction.options.getString('color');

    const reply = { content: '👁️ **Preview** (only you can see this):\n' };

    if (title) {
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(message);

      if (imageUrl) embed.setImage(imageUrl);
      if (colorHex) {
        const parsed = parseInt(colorHex.replace('#', ''), 16);
        if (!isNaN(parsed)) embed.setColor(parsed);
      }

      reply.embeds = [embed];
    } else {
      reply.content += message;
      if (imageUrl) {
        const embed = new EmbedBuilder().setImage(imageUrl);
        reply.embeds = [embed];
      }
    }

    reply.content += '\n\n*Use `/send` with the same options to post this.*';

    await interaction.editReply(reply);
  },
};

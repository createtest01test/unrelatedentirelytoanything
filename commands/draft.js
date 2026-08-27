const { SlashCommandBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('draft')
    .setDescription('Write a multi-line message as the bot using a popup editor')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('Channel to send the message in')
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName('title')
        .setDescription('Optional embed title (makes it a rich embed)')
        .setRequired(false))
    .addStringOption(opt =>
      opt.setName('color')
        .setDescription('Embed accent color as hex (e.g. #ff6b6b). Only used with title.')
        .setRequired(false))
    .addStringOption(opt =>
      opt.setName('image')
        .setDescription('Optional image URL to attach')
        .setRequired(false)),

  async execute(interaction, client) {
    const channel = interaction.options.getChannel('channel');
    const title = interaction.options.getString('title');
    const colorHex = interaction.options.getString('color');
    const imageUrl = interaction.options.getString('image');

    // Store options temporarily using the interaction ID as key
    client._draftOptions = client._draftOptions || {};
    client._draftOptions[interaction.user.id] = { channel, title, colorHex, imageUrl };

    // Show the modal popup
    const modal = new ModalBuilder()
      .setCustomId('draft_modal')
      .setTitle('Draft a message');

    const messageInput = new TextInputBuilder()
      .setCustomId('draft_content')
      .setLabel('Message content')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Type your message here... Press Enter for line breaks.')
      .setRequired(true)
      .setMaxLength(2000);

    modal.addComponents(new ActionRowBuilder().addComponents(messageInput));

    await interaction.showModal(modal);
  },

  // Handle the modal submission
  async handleModal(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const content = interaction.fields.getTextInputValue('draft_content');
    const opts = client._draftOptions?.[interaction.user.id] || {};
    const { channel, title, colorHex, imageUrl } = opts;

    if (!channel) {
      return interaction.editReply('❌ Something went wrong — channel not found. Try the command again.');
    }

    const messageOptions = {};

    if (title) {
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(content);

      if (imageUrl) embed.setImage(imageUrl);
      if (colorHex) {
        const parsed = parseInt(colorHex.replace('#', ''), 16);
        if (!isNaN(parsed)) embed.setColor(parsed);
      }

      messageOptions.embeds = [embed];
    } else {
      messageOptions.content = content;
      if (imageUrl) {
        const embed = new EmbedBuilder().setImage(imageUrl);
        messageOptions.embeds = [embed];
      }
    }

    try {
      await channel.send(messageOptions);
      // Clean up stored options
      delete client._draftOptions[interaction.user.id];
      await interaction.editReply(`✅ Message sent in <#${channel.id}>`);
    } catch (err) {
      console.error(err);
      await interaction.editReply('❌ Could not send to that channel. Make sure I have permissions there.');
    }
  },
};

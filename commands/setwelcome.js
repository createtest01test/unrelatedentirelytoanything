const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { loadConfig, saveConfig } = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setwelcome')
    .setDescription('Configure the welcome message for new members')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName('channel')
        .setDescription('Set the channel where welcome messages are sent')
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('The welcome channel')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('message')
        .setDescription('Set the welcome message text (use {user} to ping the new member)')
        .addStringOption(opt =>
          opt.setName('text')
            .setDescription('Welcome message. Use {user} to ping. Supports emojis.')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('image')
        .setDescription('Set or clear the image shown in welcome messages')
        .addStringOption(opt =>
          opt.setName('url')
            .setDescription('Image URL (leave empty to remove image)')
            .setRequired(false)))
    .addSubcommand(sub =>
      sub.setName('preview')
        .setDescription('Preview the current welcome message')),

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const sub = interaction.options.getSubcommand();
    const config = await loadConfig(client);

    if (sub === 'channel') {
      const channel = interaction.options.getChannel('channel');
      config.welcomeChannelId = channel.id;
      await saveConfig(client, config);
      await interaction.editReply(`✅ Welcome channel set to <#${channel.id}>`);

    } else if (sub === 'message') {
      const text = interaction.options.getString('text');
      config.welcomeMessage = text;
      await saveConfig(client, config);
      await interaction.editReply(`✅ Welcome message updated:\n> ${text.replace('{user}', '@newcomer')}`);

    } else if (sub === 'image') {
      const url = interaction.options.getString('url');
      config.welcomeImageUrl = url || null;
      await saveConfig(client, config);
      await interaction.editReply(url ? `✅ Welcome image set.` : `✅ Welcome image removed.`);

    } else if (sub === 'preview') {
      const { EmbedBuilder } = require('discord.js');

      if (!config.welcomeMessage) {
        return interaction.editReply('❌ No welcome message set yet. Use `/setwelcome message` first.');
      }

      const previewText = config.welcomeMessage.replace('{user}', `<@${interaction.user.id}>`);
      const opts = { content: `**Preview:**\n${previewText}` };

      if (config.welcomeImageUrl) {
        const embed = new EmbedBuilder().setImage(config.welcomeImageUrl);
        opts.embeds = [embed];
      }

      if (config.welcomeChannelId) {
        opts.content += `\n📌 Sends to: <#${config.welcomeChannelId}>`;
      } else {
        opts.content += `\n⚠️ No channel set yet.`;
      }

      await interaction.editReply(opts);
    }
  },
};

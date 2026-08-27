const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { loadConfig } = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('View the current bot configuration')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const config = await loadConfig(client);

    const embed = new EmbedBuilder()
      .setTitle('⚙️ Bot Configuration')
      .setColor(0x5865f2)
      .addFields(
        {
          name: '👋 Welcome',
          value: [
            `**Channel:** ${config.welcomeChannelId ? `<#${config.welcomeChannelId}>` : '*not set*'}`,
            `**Message:** ${config.welcomeMessage || '*not set*'}`,
            `**Image:** ${config.welcomeImageUrl ? `[link](${config.welcomeImageUrl})` : '*none*'}`,
          ].join('\n'),
        },
        {
          name: '🟢 Status / Role Tracker',
          value: [
            `**Role:** ${config.statusRole || '*not set*'}`,
            `**Template:** ${config.statusTemplate || '*not set*'}`,
          ].join('\n'),
        },
      )
      .setFooter({ text: 'Use /setwelcome and /setrole to change these settings' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

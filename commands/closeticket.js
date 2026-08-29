const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const ticketManager = require('../tickets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('closeticket')
    .setDescription('Close and archive this ticket')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });
    await ticketManager.closeTicket(interaction, client);
  },
};

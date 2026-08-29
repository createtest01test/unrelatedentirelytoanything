const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('staffmode')
    .setDescription('Set how your name appears when replying to tickets in this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(opt =>
      opt.setName('mode')
        .setDescription('How to identify yourself in ticket replies')
        .setRequired(true)
        .addChoices(
          { name: 'Show my username', value: 'username' },
          { name: 'Show as Staff (anonymous)', value: 'staff' },
        )),

  async execute(interaction, client) {
    const mode = interaction.options.getString('mode');
    client._staffModes = client._staffModes || {};
    client._staffModes[interaction.user.id] = mode;
    const label = mode === 'username' ? `your username (**${interaction.user.username}**)` : '**Staff**';
    await interaction.reply({ content: `✅ Your replies in tickets will show as ${label}.`, ephemeral: true });
  },
};

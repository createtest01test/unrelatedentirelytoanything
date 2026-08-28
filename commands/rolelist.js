const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rolelist')
    .setDescription('Get a list of every Discord username with a specific role')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addRoleOption(opt =>
      opt.setName('role')
        .setDescription('The role to list members of')
        .setRequired(true)),

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const role = interaction.options.getRole('role');
    await interaction.guild.members.fetch();

    const members = role.members.map(m => m.user.username).sort();

    if (!members.length) {
      return interaction.editReply(`No members found with the **${role.name}** role.`);
    }

    // Split into chunks if too long for one message
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

    await interaction.editReply({ content: chunks[0] });
    for (let i = 1; i < chunks.length; i++) {
      await interaction.followUp({ content: chunks[i], ephemeral: true });
    }
  },
};

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { loadConfig, saveConfig } = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setrole')
    .setDescription('Track a role count in the bot\'s status')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName('track')
        .setDescription('Set which role to count and how to display it in the bot status')
        .addRoleOption(opt =>
          opt.setName('role')
            .setDescription('The role to count')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('template')
            .setDescription('Status text. Use {count} for the number, {role} for the role name.')
            .setRequired(false)))
    .addSubcommand(sub =>
      sub.setName('clear')
        .setDescription('Stop tracking a role in the status'))
    .addSubcommand(sub =>
      sub.setName('check')
        .setDescription('Check current role count and status preview')),

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const sub = interaction.options.getSubcommand();
    const config = await loadConfig(client);

    if (sub === 'track') {
      const role = interaction.options.getRole('role');
      const template = interaction.options.getString('template') || `We have {count} ${role.name}s`;

      config.statusRole = role.name;
      config.statusTemplate = template;
      await saveConfig(client, config);

      // Immediately update the status
      await client.updateStatus(client);

      const preview = template.replace('{count}', role.members.size).replace('{role}', role.name);
      await interaction.editReply(`✅ Now tracking **${role.name}** in bot status.\n📋 Current status: \`${preview}\``);

    } else if (sub === 'clear') {
      config.statusRole = null;
      config.statusTemplate = null;
      await saveConfig(client, config);
      client.user.setPresence({ activities: [] });
      await interaction.editReply('✅ Role tracking cleared. Bot status is now empty.');

    } else if (sub === 'check') {
      if (!config.statusRole) {
        return interaction.editReply('❌ No role being tracked. Use `/setrole track` to set one.');
      }

      const guild = interaction.guild;
      await guild.members.fetch();
      const role = guild.roles.cache.find(r => r.name === config.statusRole);

      if (!role) {
        return interaction.editReply(`❌ Role **${config.statusRole}** not found in this server. It may have been deleted.`);
      }

      const count = role.members.size;
      const preview = config.statusTemplate
        .replace('{count}', count)
        .replace('{role}', config.statusRole);

      await interaction.editReply(
        `📊 Role: **${role.name}**\n👥 Count: **${count}**\n🟢 Status: \`${preview}\``
      );
    }
  },
};

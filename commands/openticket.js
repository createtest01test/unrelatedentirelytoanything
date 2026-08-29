const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const { ticketsByUser, ticketsByChannel, loadTicketData } = require('../tickets');

const STAFF_GUILD_ID      = '1494002714009665537';
const TICKETS_CATEGORY_ID = '1543326930911240242';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('openticket')
    .setDescription('Open or reopen a ticket for a user from the staff side')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption(opt =>
      opt.setName('userid')
        .setDescription('The Discord user ID to open a ticket for')
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName('reason')
        .setDescription('Optional reason shown in the ticket channel')
        .setRequired(false)),

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const userId = interaction.options.getString('userid').trim();
    const reason = interaction.options.getString('reason') || null;

    // Fetch the user
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) {
      return interaction.editReply('❌ Could not find a user with that ID.');
    }

    const staffGuild = await client.guilds.fetch(STAFF_GUILD_ID).catch(() => null);
    if (!staffGuild) return interaction.editReply('❌ Cannot access the staff server.');

    const existing = ticketsByUser.get(userId);

    // ── Reopen existing closed ticket ─────────────────────────────────────────
    if (existing && existing.status === 'closed') {
      const channel = await staffGuild.channels.fetch(existing.channelId).catch(() => null);
      if (channel) {
        await channel.setParent(TICKETS_CATEGORY_ID, { lockPermissions: false });
        existing.status = 'open';
        ticketsByUser.set(userId, existing);

        const reopenEmbed = new EmbedBuilder()
          .setColor(0x57f287)
          .setDescription(`🔄 **Ticket reopened** by ${interaction.user.username}${reason ? `\n📋 Reason: ${reason}` : ''}`)
          .setTimestamp();
        await channel.send({ embeds: [reopenEmbed] });

        // Notify the user
        await user.send({ embeds: [new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle('Ticket Reopened')
          .setDescription(`Your ticket has been reopened by staff.${reason ? `\n\n**Reason:** ${reason}` : ''}\n\nYou can reply here and we\'ll get back to you.`)
          .setTimestamp()] }).catch(() => {});

        return interaction.editReply(`✅ Reopened existing ticket for **${user.username}** in <#${channel.id}>`);
      }
      // Channel gone, fall through to create new
      ticketsByUser.delete(userId);
    }

    // ── Already open ───────────────────────────────────────────────────────────
    if (existing && existing.status === 'open') {
      const channel = await staffGuild.channels.fetch(existing.channelId).catch(() => null);
      if (channel) {
        return interaction.editReply(`⚠️ **${user.username}** already has an open ticket: <#${channel.id}>`);
      }
      ticketsByUser.delete(userId);
    }

    // ── Create a brand new staff-initiated ticket ──────────────────────────────
    const { saveTicketData } = require('../tickets');
    let ticketCounter = 1;
    // Find highest ticket number to continue sequence
    for (const t of ticketsByUser.values()) {
      const num = parseInt(t.ticketNumber);
      if (!isNaN(num) && num >= ticketCounter) ticketCounter = num + 1;
    }
    const ticketNum   = String(ticketCounter).padStart(4, '0');
    const safeName    = user.username.toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
    const channelName = `${safeName}-${ticketNum}`;

    const channel = await staffGuild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: TICKETS_CATEGORY_ID,
      topic: `Ticket #${ticketNum} | User: ${user.username} (${user.id}) | Opened by staff`,
    });

    ticketsByUser.set(userId, { channelId: channel.id, ticketNumber: ticketNum, status: 'open', originalName: channelName });
    ticketsByChannel.set(channel.id, userId);
    await saveTicketData(client);

    const headerEmbed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`Ticket #${ticketNum} — Staff Initiated`)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: 'Username', value: `${user.username} (<@${user.id}>)`, inline: true },
        { name: 'Opened by', value: interaction.user.username, inline: true },
        { name: 'User ID', value: user.id, inline: false },
      )
      .setFooter({ text: 'Reply in this channel to respond. Use /closeticket to archive.' })
      .setTimestamp();

    if (reason) headerEmbed.addFields({ name: 'Reason', value: reason });
    await channel.send({ embeds: [headerEmbed] });

    // DM the user
    await user.send({ embeds: [new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('You have a new message from ChemicaL Staff')
      .setDescription(`A staff member has opened a ticket with you.${reason ? `\n\n**Reason:** ${reason}` : ''}\n\nReply here and we'll get back to you.`)
      .setTimestamp()] }).catch(() => {});

    await interaction.editReply(`✅ Ticket created for **${user.username}**: <#${channel.id}>`);
  },
};

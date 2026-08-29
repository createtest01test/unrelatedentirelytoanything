const { EmbedBuilder, ChannelType } = require('discord.js');

const STAFF_GUILD_ID      = '1494002714009665537';
const MAIN_GUILD_ID       = '1480349095842283520';
const TICKETS_CATEGORY_ID = '1543326930911240242';
const ARCHIVE_CATEGORY_ID = '1543327033478742096';

// In-memory store: userId → { channelId, ticketNumber, status }
// and channelId → userId for reverse lookup
const ticketsByUser    = new Map();
const ticketsByChannel = new Map();

let ticketCounter = 1;

function padTicketNum(n) {
  return String(n).padStart(4, '0');
}

// ── Get user display info ──────────────────────────────────────────────────────
async function getUserInfo(user, mainGuild) {
  let nickname = null;
  let pronouns = null;

  try {
    const member = await mainGuild.members.fetch(user.id).catch(() => null);
    if (member) {
      nickname = member.nickname || null;
      // Discord doesn't expose pronouns via API natively,
      // but some servers use bots that store them. We'll try the member's bio if available.
    }
  } catch (_) {}

  return { username: user.username, nickname, pronouns };
}

// ── Format the header shown in the ticket channel ─────────────────────────────
function buildTicketHeader(user, info, ticketNum) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`Ticket #${ticketNum}`)
    .setThumbnail(user.displayAvatarURL())
    .addFields(
      { name: 'Username', value: `${info.username} (<@${user.id}>)`, inline: true },
      { name: 'Nickname', value: info.nickname || '*none*', inline: true },
      { name: 'User ID', value: user.id, inline: false },
    )
    .setFooter({ text: 'Reply in this channel to respond. Use /closeticket to archive.' })
    .setTimestamp();
  return embed;
}

// ── Open or reopen a ticket ───────────────────────────────────────────────────
async function openTicket(client, user, firstMessage) {
  const staffGuild = await client.guilds.fetch(STAFF_GUILD_ID).catch(() => null);
  const mainGuild  = await client.guilds.fetch(MAIN_GUILD_ID).catch(() => null);

  if (!staffGuild) {
    console.error('❌ Cannot find staff guild — is the bot invited there?');
    return;
  }

  const existing = ticketsByUser.get(user.id);

  // ── Reopen closed ticket ───────────────────────────────────────────────────
  if (existing && existing.status === 'closed') {
    try {
      const channel = await staffGuild.channels.fetch(existing.channelId).catch(() => null);
      if (channel) {
        await channel.setParent(TICKETS_CATEGORY_ID, { lockPermissions: false });
        existing.status = 'open';
        ticketsByUser.set(user.id, existing);

        const reopenEmbed = new EmbedBuilder()
          .setColor(0x57f287)
          .setDescription(`🔄 **Ticket reopened** — ${user.username} sent a new message.`)
          .setTimestamp();
        await channel.send({ embeds: [reopenEmbed] });

        // Forward the new message
        await forwardToChannel(channel, user, firstMessage, true);
        await user.send('↩️ Your ticket has been reopened. Staff will be with you shortly.');
        return;
      }
    } catch (err) {
      console.error('Reopen error:', err);
    }
  }

  // ── Brand new ticket ───────────────────────────────────────────────────────
  const ticketNum = padTicketNum(ticketCounter++);
  const channelName = `${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}-${ticketNum}`;

  const info = mainGuild ? await getUserInfo(user, mainGuild) : { username: user.username, nickname: null };

  const channel = await staffGuild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: TICKETS_CATEGORY_ID,
    topic: `Ticket #${ticketNum} | User: ${user.username} (${user.id})`,
  });

  ticketsByUser.set(user.id, { channelId: channel.id, ticketNumber: ticketNum, status: 'open' });
  ticketsByChannel.set(channel.id, user.id);

  // Send the header embed
  await channel.send({ embeds: [buildTicketHeader(user, info, ticketNum)] });

  // Forward first message
  await forwardToChannel(channel, user, firstMessage, true);

  // Confirm to user
  const confirmEmbed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Ticket Created')
    .setDescription('Your message has been received! Our staff will get back to you shortly.\n\nPlease send your question or report in full so we have a clear understanding of the situation.')
    .setTimestamp();
  await user.send({ embeds: [confirmEmbed] });
}

// ── Forward a DM message to the ticket channel ────────────────────────────────
async function forwardToChannel(channel, user, message, isFirst = false) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({ name: `${user.username}`, iconURL: user.displayAvatarURL() });

  if (message.content) embed.setDescription(message.content);

  // Handle attachments
  const files = [];
  if (message.attachments?.size) {
    const imgs = [];
    for (const att of message.attachments.values()) {
      if (att.contentType?.startsWith('image/')) {
        imgs.push(att.url);
      } else {
        files.push(att.url);
      }
    }
    if (imgs.length) embed.setImage(imgs[0]);
    if (imgs.length > 1) embed.addFields({ name: 'More images', value: imgs.slice(1).join('\n') });
  }

  await channel.send({ embeds: [embed], files });
}

// ── Forward a staff message to the user's DMs ─────────────────────────────────
async function forwardToUser(client, channelId, staffMember, message) {
  const userId = ticketsByChannel.get(channelId);
  if (!userId) return;

  const ticket = [...ticketsByUser.values()].find(t => t.channelId === channelId);
  if (!ticket || ticket.status === 'closed') return;

  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) return;

  // Determine display name
  client._staffModes = client._staffModes || {};
  const mode = client._staffModes[staffMember.id] || 'staff';
  const senderName = mode === 'username' ? staffMember.username : 'Staff';
  const avatar = mode === 'username' ? staffMember.displayAvatarURL() : null;

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setAuthor({ name: senderName, ...(avatar ? { iconURL: avatar } : {}) });

  if (message.content) embed.setDescription(message.content);

  const files = [];
  if (message.attachments?.size) {
    const imgs = [];
    for (const att of message.attachments.values()) {
      if (att.contentType?.startsWith('image/')) {
        imgs.push(att.url);
      } else {
        files.push(att.url);
      }
    }
    if (imgs.length) embed.setImage(imgs[0]);
    if (imgs.length > 1) embed.addFields({ name: 'More images', value: imgs.slice(1).join('\n') });
  }

  try {
    await user.send({ embeds: [embed], files });
    await message.react('✅');
  } catch (err) {
    await message.react('❌');
    console.error('Failed to DM user:', err);
  }
}

// ── Close a ticket ────────────────────────────────────────────────────────────
async function closeTicket(interaction, client) {
  const channelId = interaction.channel.id;
  const userId = ticketsByChannel.get(channelId);

  if (!userId) {
    return interaction.editReply('❌ This channel isn\'t a ticket.');
  }

  const ticket = ticketsByUser.get(userId);
  if (!ticket) return interaction.editReply('❌ Ticket data not found.');

  ticket.status = 'closed';
  ticketsByUser.set(userId, ticket);

  // Move to archive category
  await interaction.channel.setParent(ARCHIVE_CATEGORY_ID, { lockPermissions: false });
  await interaction.channel.setName(`archived-${interaction.channel.name}`);

  const closeEmbed = new EmbedBuilder()
    .setColor(0xed4245)
    .setDescription(`🔒 **Ticket closed** by ${interaction.user.username}`)
    .setTimestamp();
  await interaction.channel.send({ embeds: [closeEmbed] });

  // Notify user
  const user = await client.users.fetch(userId).catch(() => null);
  if (user) {
    const userEmbed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('Ticket Closed')
      .setDescription('Your ticket has been closed by staff. If you need further help, just send another message and it will be reopened.')
      .setTimestamp();
    await user.send({ embeds: [userEmbed] }).catch(() => {});
  }

  await interaction.editReply('✅ Ticket closed and archived.');
}

module.exports = { openTicket, forwardToChannel, forwardToUser, closeTicket, ticketsByUser, ticketsByChannel };

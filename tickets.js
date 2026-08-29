const { EmbedBuilder, ChannelType } = require('discord.js');

const STAFF_GUILD_ID      = '1494002714009665537';
const MAIN_GUILD_ID       = '1480349095842283520';
const TICKETS_CATEGORY_ID = '1543326930911240242';
const ARCHIVE_CATEGORY_ID = '1543327033478742096';

// In-memory cache — rebuilt from Discord on startup
const ticketsByUser    = new Map();
const ticketsByChannel = new Map();
let   ticketCounter    = 1;

function padTicketNum(n) {
  return String(n).padStart(4, '0');
}

const TICKET_DATA_CHANNEL_ID = '1543357465377116230';

// ── Save ticket data as a pinned message in the HR data channel ───────────────
async function saveTicketData(client) {
  try {
    const channel = await client.channels.fetch(TICKET_DATA_CHANNEL_ID).catch(() => null);
    if (!channel) return;

    const data = {
      ticketCounter,
      tickets: Object.fromEntries(ticketsByUser),
      channelMap: Object.fromEntries(ticketsByChannel),
    };

    const content = `\`\`\`tickets-data\n${JSON.stringify(data, null, 2)}\n\`\`\``;
    const pins = await channel.messages.fetchPinned();
    const existing = pins.find(m => m.author.id === client.user.id && m.content.startsWith('```tickets-data'));

    if (existing) {
      await existing.edit(content);
    } else {
      const msg = await channel.send(content);
      await msg.pin();
    }
  } catch (err) {
    console.error('Failed to save ticket data:', err);
  }
}

// ── Load ticket data from the pinned message ──────────────────────────────────
async function loadTicketData(client) {
  try {
    const channel = await client.channels.fetch(TICKET_DATA_CHANNEL_ID).catch(() => null);
    if (!channel) return;

    const pins = await channel.messages.fetchPinned();
    const existing = pins.find(m => m.author.id === client.user.id && m.content.startsWith('```tickets-data'));
    if (!existing) return;

    const match = existing.content.match(/```tickets-data\n([\s\S]+?)\n```/);
    if (!match) return;

    const data = JSON.parse(match[1]);
    ticketCounter = data.ticketCounter || 1;

    ticketsByUser.clear();
    ticketsByChannel.clear();

    for (const [userId, ticket] of Object.entries(data.tickets || {})) {
      ticketsByUser.set(userId, ticket);
    }
    for (const [channelId, userId] of Object.entries(data.channelMap || {})) {
      ticketsByChannel.set(channelId, userId);
    }

    console.log(`✅ Loaded ${ticketsByUser.size} ticket(s) from Discord`);
  } catch (err) {
    console.error('Failed to load ticket data:', err);
  }
}

// ── Get user display info ──────────────────────────────────────────────────────
async function getUserInfo(user, mainGuild) {
  try {
    const member = await mainGuild.members.fetch(user.id).catch(() => null);
    if (member) return { username: user.username, nickname: member.nickname || null };
  } catch (_) {}
  return { username: user.username, nickname: null };
}

// ── Ticket header embed ────────────────────────────────────────────────────────
function buildTicketHeader(user, info, ticketNum) {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`Ticket #${ticketNum}`)
    .setThumbnail(user.displayAvatarURL())
    .addFields(
      { name: 'Username', value: `${info.username} (<@${user.id}>)`, inline: true },
      { name: 'Nickname', value: info.nickname || '*none*', inline: true },
      { name: 'User ID',  value: user.id, inline: false },
    )
    .setFooter({ text: 'Reply in this channel to respond. Use /closeticket to archive.' })
    .setTimestamp();
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
    const channel = await staffGuild.channels.fetch(existing.channelId).catch(() => null);
    if (channel) {
      await channel.setParent(TICKETS_CATEGORY_ID, { lockPermissions: false });
      existing.status = 'open';
      ticketsByUser.set(user.id, existing);
      await saveTicketData(client);

      await channel.send({ embeds: [new EmbedBuilder()
        .setColor(0x57f287)
        .setDescription(`🔄 **Ticket reopened** — ${user.username} sent a new message.`)
        .setTimestamp()] });
      await forwardToChannel(channel, user, firstMessage);
      await user.send('↩️ Your ticket has been reopened. Staff will be with you shortly.');
      return;
    }
    // Channel gone — fall through to create new
    ticketsByUser.delete(user.id);
  }

  // ── Forward to existing open ticket ───────────────────────────────────────
  if (existing && existing.status === 'open') {
    const channel = await staffGuild.channels.fetch(existing.channelId).catch(() => null);
    if (channel) {
      await forwardToChannel(channel, user, firstMessage);
      return;
    }
    ticketsByUser.delete(user.id);
  }

  // ── Brand new ticket ───────────────────────────────────────────────────────
  const ticketNum   = padTicketNum(ticketCounter++);
  const safeName    = user.username.toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
  const channelName = `${safeName}-${ticketNum}`;
  const info        = mainGuild ? await getUserInfo(user, mainGuild) : { username: user.username, nickname: null };

  const channel = await staffGuild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: TICKETS_CATEGORY_ID,
    topic: `Ticket #${ticketNum} | User: ${user.username} (${user.id})`,
  });

  ticketsByUser.set(user.id,       { channelId: channel.id, ticketNumber: ticketNum, status: 'open', originalName: channelName });
  ticketsByChannel.set(channel.id, user.id);
  await saveTicketData(client);

  await channel.send({ embeds: [buildTicketHeader(user, info, ticketNum)] });
  await forwardToChannel(channel, user, firstMessage);

  await user.send({ embeds: [new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Ticket Created')
    .setDescription('Your message has been received! Our staff will get back to you here in DMs.\n\nJust keep sending messages here and we\'ll see them.')
    .setTimestamp()] });
}

// ── Forward DM → staff channel ────────────────────────────────────────────────
async function forwardToChannel(channel, user, message) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() });

  if (message.content) embed.setDescription(message.content);

  const files = [];
  if (message.attachments?.size) {
    const imgs = [];
    for (const att of message.attachments.values()) {
      if (att.contentType?.startsWith('image/')) imgs.push(att.url);
      else files.push(att.url);
    }
    if (imgs.length)     embed.setImage(imgs[0]);
    if (imgs.length > 1) embed.addFields({ name: 'More images', value: imgs.slice(1).join('\n') });
  }

  await channel.send({ embeds: [embed], files });
}

// ── Forward staff channel → DM ────────────────────────────────────────────────
async function forwardToUser(client, channelId, staffMember, message) {
  const userId = ticketsByChannel.get(channelId);
  if (!userId) return;

  const ticket = ticketsByUser.get(userId);
  if (!ticket || ticket.status === 'closed') return;

  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) return;

  client._staffModes = client._staffModes || {};
  const mode       = client._staffModes[staffMember.id] || 'staff';
  const senderName = mode === 'username' ? staffMember.username : 'Staff';
  const avatar     = mode === 'username' ? staffMember.displayAvatarURL() : null;

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setAuthor({ name: senderName, ...(avatar ? { iconURL: avatar } : {}) });

  if (message.content) embed.setDescription(message.content);

  const files = [];
  if (message.attachments?.size) {
    const imgs = [];
    for (const att of message.attachments.values()) {
      if (att.contentType?.startsWith('image/')) imgs.push(att.url);
      else files.push(att.url);
    }
    if (imgs.length)     embed.setImage(imgs[0]);
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
  const userId    = ticketsByChannel.get(channelId);

  if (!userId) return interaction.editReply('❌ This channel isn\'t a ticket.');

  const ticket = ticketsByUser.get(userId);
  if (!ticket) return interaction.editReply('❌ Ticket data not found.');

  ticket.status = 'closed';
  ticketsByUser.set(userId, ticket);
  await saveTicketData(client);

  await interaction.channel.setParent(ARCHIVE_CATEGORY_ID, { lockPermissions: false });

  await interaction.channel.send({ embeds: [new EmbedBuilder()
    .setColor(0xed4245)
    .setDescription(`🔒 **Ticket closed** by ${interaction.user.username}`)
    .setTimestamp()] });

  const user = await client.users.fetch(userId).catch(() => null);
  if (user) {
    await user.send({ embeds: [new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('Ticket Closed')
      .setDescription('Your ticket has been closed by staff. If you need further help, just send another message and it will be reopened.')
      .setTimestamp()] }).catch(() => {});
  }

  await interaction.editReply('✅ Ticket closed and archived.');
}

module.exports = { openTicket, forwardToChannel, forwardToUser, closeTicket, loadTicketData, ticketsByUser, ticketsByChannel };

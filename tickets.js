const { EmbedBuilder, ChannelType } = require('discord.js');
const fs = require('fs');
const path = require('path');

const STAFF_GUILD_ID      = '1494002714009665537';
const MAIN_GUILD_ID       = '1480349095842283520';
const TICKETS_CATEGORY_ID = '1543326930911240242';
const ARCHIVE_CATEGORY_ID = '1543327033478742096';
const DATA_FILE           = path.join(__dirname, 'tickets-data.json');

// ── Persist to disk ────────────────────────────────────────────────────────────
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      return {
        ticketsByUser:    new Map(Object.entries(raw.ticketsByUser || {})),
        ticketsByChannel: new Map(Object.entries(raw.ticketsByChannel || {})),
        ticketCounter:    raw.ticketCounter || 1,
      };
    }
  } catch (err) {
    console.error('Failed to load ticket data:', err);
  }
  return {
    ticketsByUser:    new Map(),
    ticketsByChannel: new Map(),
    ticketCounter:    1,
  };
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      ticketsByUser:    Object.fromEntries(ticketsByUser),
      ticketsByChannel: Object.fromEntries(ticketsByChannel),
      ticketCounter,
    }, null, 2));
  } catch (err) {
    console.error('Failed to save ticket data:', err);
  }
}

const loaded = loadData();
const ticketsByUser    = loaded.ticketsByUser;
const ticketsByChannel = loaded.ticketsByChannel;
let   ticketCounter    = loaded.ticketCounter;

function padTicketNum(n) {
  return String(n).padStart(4, '0');
}

// ── Get user display info ──────────────────────────────────────────────────────
async function getUserInfo(user, mainGuild) {
  try {
    const member = await mainGuild.members.fetch(user.id).catch(() => null);
    if (member) {
      return { username: user.username, nickname: member.nickname || null };
    }
  } catch (_) {}
  return { username: user.username, nickname: null };
}

// ── Format the ticket header embed ────────────────────────────────────────────
function buildTicketHeader(user, info, ticketNum) {
  const embed = new EmbedBuilder()
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

  // ── Reopen a closed ticket ─────────────────────────────────────────────────
  if (existing && existing.status === 'closed') {
    try {
      const channel = await staffGuild.channels.fetch(existing.channelId).catch(() => null);
      if (channel) {
        // Move back to active tickets category
        await channel.setParent(TICKETS_CATEGORY_ID, { lockPermissions: false });

        // Strip "archived-" prefix from channel name if present
        if (channel.name.startsWith('archived-')) {
          await channel.setName(channel.name.replace('archived-', ''));
        }

        existing.status = 'open';
        ticketsByUser.set(user.id, existing);
        saveData();

        const reopenEmbed = new EmbedBuilder()
          .setColor(0x57f287)
          .setDescription(`🔄 **Ticket reopened** — ${user.username} sent a new message.`)
          .setTimestamp();
        await channel.send({ embeds: [reopenEmbed] });
        await forwardToChannel(channel, user, firstMessage);
        await user.send('↩️ Your ticket has been reopened. Staff will be with you shortly.');
        return;
      }
    } catch (err) {
      console.error('Reopen error:', err);
    }
    // Channel was deleted or unreachable — fall through to create a new one
    ticketsByUser.delete(user.id);
  }

  // ── Skip if already open ───────────────────────────────────────────────────
  if (existing && existing.status === 'open') {
    const channel = await staffGuild.channels.fetch(existing.channelId).catch(() => null);
    if (channel) {
      await forwardToChannel(channel, user, firstMessage);
      return;
    }
    // Channel missing, fall through to create new
    ticketsByUser.delete(user.id);
  }

  // ── Create brand new ticket ────────────────────────────────────────────────
  const ticketNum  = padTicketNum(ticketCounter++);
  const safeName   = user.username.toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
  const channelName = `${safeName}-${ticketNum}`;
  const info = mainGuild ? await getUserInfo(user, mainGuild) : { username: user.username, nickname: null };

  const channel = await staffGuild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: TICKETS_CATEGORY_ID,
    topic: `Ticket #${ticketNum} | User: ${user.username} (${user.id})`,
  });

  ticketsByUser.set(user.id,       { channelId: channel.id, ticketNumber: ticketNum, status: 'open' });
  ticketsByChannel.set(channel.id, user.id);
  saveData();

  await channel.send({ embeds: [buildTicketHeader(user, info, ticketNum)] });
  await forwardToChannel(channel, user, firstMessage);

  const confirmEmbed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Ticket Created')
    .setDescription('Your message has been received! Our staff will get back to you here in DMs.\n\nJust keep sending messages here and we\'ll see them.')
    .setTimestamp();
  await user.send({ embeds: [confirmEmbed] });
}

// ── Forward DM → ticket channel ───────────────────────────────────────────────
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

// ── Forward ticket channel → user DM ─────────────────────────────────────────
async function forwardToUser(client, channelId, staffMember, message) {
  const userId = ticketsByChannel.get(channelId);
  if (!userId) return;

  const ticket = ticketsByUser.get(userId);
  if (!ticket || ticket.status === 'closed') return;

  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) return;

  client._staffModes = client._staffModes || {};
  const mode        = client._staffModes[staffMember.id] || 'staff';
  const senderName  = mode === 'username' ? staffMember.username : 'Staff';
  const avatar      = mode === 'username' ? staffMember.displayAvatarURL() : null;

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
  saveData();

  await interaction.channel.setParent(ARCHIVE_CATEGORY_ID, { lockPermissions: false });
  await interaction.channel.setName(`archived-${interaction.channel.name}`);

  const closeEmbed = new EmbedBuilder()
    .setColor(0xed4245)
    .setDescription(`🔒 **Ticket closed** by ${interaction.user.username}`)
    .setTimestamp();
  await interaction.channel.send({ embeds: [closeEmbed] });

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

const {
  SlashCommandBuilder, PermissionFlagsBits, ModalBuilder,
  TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder,
  ButtonBuilder, ButtonStyle
} = require('discord.js');

// Parse buttons from a simple format:
// "Button Text | https://link.com | 🔗" per line (emoji is optional)
function parseButtons(raw) {
  if (!raw) return [];
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 5) // Discord max 5 buttons per row
    .map(line => {
      const parts = line.split('|').map(p => p.trim());
      return {
        label: parts[0] || 'Button',
        url:   parts[1] || null,
        emoji: parts[2] || null,
      };
    })
    .filter(b => b.url && b.url.startsWith('http'));
}

function buildButtonRow(buttons) {
  if (!buttons.length) return null;
  const row = new ActionRowBuilder();
  for (const b of buttons) {
    const btn = new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setURL(b.url)
      .setLabel(b.label);
    if (b.emoji) {
      try { btn.setEmoji(b.emoji); } catch (_) { /* invalid emoji, skip */ }
    }
    row.addComponents(btn);
  }
  return row;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('draft')
    .setDescription('Write a multi-line message as the bot using a popup editor')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('Channel to send the message in')
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName('style')
        .setDescription('How the message should look')
        .setRequired(false)
        .addChoices(
          { name: 'Plain — regular chat message', value: 'plain' },
          { name: 'Embed — colored box like ProBot announcements', value: 'embed' },
        ))
    .addBooleanOption(opt =>
      opt.setName('buttons')
        .setDescription('Add clickable link buttons to the message?')
        .setRequired(false))
    .addStringOption(opt =>
      opt.setName('title')
        .setDescription('Title shown at the top of the embed (embed style only)')
        .setRequired(false))
    .addStringOption(opt =>
      opt.setName('color')
        .setDescription('Sidebar/accent color as hex e.g. #ff6b6b (embed style only)')
        .setRequired(false))
    .addStringOption(opt =>
      opt.setName('image')
        .setDescription('Optional image URL shown inside the embed or below a plain message')
        .setRequired(false))
    .addStringOption(opt =>
      opt.setName('thumbnail')
        .setDescription('Small image in the top-right corner of an embed (embed style only)')
        .setRequired(false))
    .addStringOption(opt =>
      opt.setName('footer')
        .setDescription('Small text at the bottom of the embed (embed style only)')
        .setRequired(false)),

  async execute(interaction, client) {
    const channel    = interaction.options.getChannel('channel');
    const style      = interaction.options.getString('style') || 'plain';
    const addButtons = interaction.options.getBoolean('buttons') || false;
    const title      = interaction.options.getString('title');
    const colorHex   = interaction.options.getString('color');
    const imageUrl   = interaction.options.getString('image');
    const thumbnail  = interaction.options.getString('thumbnail');
    const footer     = interaction.options.getString('footer');

    client._draftOptions = client._draftOptions || {};
    client._draftOptions[interaction.user.id] = { channel, style, addButtons, title, colorHex, imageUrl, thumbnail, footer };

    const modal = new ModalBuilder()
      .setCustomId('draft_modal')
      .setTitle(style === 'embed' ? 'Draft an embed message' : 'Draft a message');

    const messageInput = new TextInputBuilder()
      .setCustomId('draft_content')
      .setLabel('Message content')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Type your message here... Press Enter for line breaks.')
      .setRequired(true)
      .setMaxLength(4000);

    modal.addComponents(new ActionRowBuilder().addComponents(messageInput));

    // If buttons enabled, add a second input field for button definitions
    if (addButtons) {
      const buttonInput = new TextInputBuilder()
        .setCustomId('draft_buttons')
        .setLabel('Buttons — one per line: Text | URL | emoji')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder(
          'Visit Website | https://example.com | 🌐\nJoin Discord | https://discord.gg/abc | 👾\n(emoji is optional, max 5 buttons)'
        )
        .setRequired(false)
        .setMaxLength(1000);

      modal.addComponents(new ActionRowBuilder().addComponents(buttonInput));
    }

    await interaction.showModal(modal);
  },

  async handleModal(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const content     = interaction.fields.getTextInputValue('draft_content');
    const rawButtons  = interaction.fields.fields.get('draft_buttons')?.value || null;
    const opts        = client._draftOptions?.[interaction.user.id] || {};
    const { channel, style, title, colorHex, imageUrl, thumbnail, footer } = opts;

    if (!channel) {
      return interaction.editReply('❌ Something went wrong — channel not found. Try the command again.');
    }

    const messageOptions = {};

    // ── Build embed or plain ────────────────────────────────────────────────
    if (style === 'embed') {
      const embed = new EmbedBuilder().setDescription(content);
      if (title)     embed.setTitle(title);
      if (imageUrl)  embed.setImage(imageUrl);
      if (thumbnail) embed.setThumbnail(thumbnail);
      if (footer)    embed.setFooter({ text: footer });
      if (colorHex) {
        const parsed = parseInt(colorHex.replace('#', ''), 16);
        if (!isNaN(parsed)) embed.setColor(parsed);
      } else {
        embed.setColor(0x5865f2);
      }
      messageOptions.embeds = [embed];
    } else {
      messageOptions.content = content;
      if (imageUrl) {
        const embed = new EmbedBuilder().setImage(imageUrl);
        messageOptions.embeds = [embed];
      }
    }

    // ── Build buttons ───────────────────────────────────────────────────────
    const buttons = parseButtons(rawButtons);
    const buttonRow = buildButtonRow(buttons);
    if (buttonRow) messageOptions.components = [buttonRow];

    try {
      await channel.send(messageOptions);
      delete client._draftOptions[interaction.user.id];

      const summary = buttons.length
        ? `✅ Message sent in <#${channel.id}> with ${buttons.length} button${buttons.length > 1 ? 's' : ''}`
        : `✅ Message sent in <#${channel.id}>`;

      await interaction.editReply(summary);
    } catch (err) {
      console.error(err);
      await interaction.editReply('❌ Could not send to that channel. Make sure I have permissions there.');
    }
  },
};

const {
  SlashCommandBuilder, PermissionFlagsBits, ModalBuilder,
  TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder,
  ButtonBuilder, ButtonStyle
} = require('discord.js');

// Parse message link into channel + message ID
function parseMessageLink(link) {
  const match = link.match(/channels\/(\d+)\/(\d+)\/(\d+)/);
  if (!match) return null;
  return { guildId: match[1], channelId: match[2], messageId: match[3] };
}

// Parse buttons same as draft
function parseButtons(raw) {
  if (!raw) return [];
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map(line => {
      const parts = line.split('|').map(p => p.trim());
      return { label: parts[0] || 'Button', url: parts[1] || null, emoji: parts[2] || null };
    })
    .filter(b => b.url && b.url.startsWith('http'));
}

function buildButtonRow(buttons) {
  if (!buttons.length) return null;
  const row = new ActionRowBuilder();
  for (const b of buttons) {
    const btn = new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(b.url).setLabel(b.label);
    if (b.emoji) { try { btn.setEmoji(b.emoji); } catch (_) {} }
    row.addComponents(btn);
  }
  return row;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('edit')
    .setDescription('Edit an existing bot message without resending it')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(opt =>
      opt.setName('message_link')
        .setDescription('Right-click the bot message → Copy Message Link')
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName('action')
        .setDescription('What do you want to change?')
        .setRequired(true)
        .addChoices(
          { name: 'Edit text / description', value: 'text' },
          { name: 'Change or remove image', value: 'image' },
          { name: 'Change or remove thumbnail', value: 'thumbnail' },
          { name: 'Change or remove footer', value: 'footer' },
          { name: 'Change or remove title', value: 'title' },
          { name: 'Change embed color', value: 'color' },
          { name: 'Edit buttons', value: 'buttons' },
          { name: 'Remove all buttons', value: 'remove_buttons' },
        ))
    .addStringOption(opt =>
      opt.setName('value')
        .setDescription('The new value (URL for image/thumbnail, hex for color, text for others). Leave empty to remove.')
        .setRequired(false)),

  async execute(interaction, client) {
    const link   = interaction.options.getString('message_link');
    const action = interaction.options.getString('action');
    const value  = interaction.options.getString('value') || null;

    const parsed = parseMessageLink(link);
    if (!parsed) {
      return interaction.reply({ content: '❌ Invalid message link. Right-click the message → Copy Message Link.', ephemeral: true });
    }

    // For text and buttons we show a modal, everything else we handle directly
    if (action === 'text' || action === 'buttons') {
      client._editOptions = client._editOptions || {};
      client._editOptions[interaction.user.id] = { parsed, action };

      const modal = new ModalBuilder()
        .setCustomId('edit_modal')
        .setTitle(action === 'text' ? 'Edit message text' : 'Edit buttons');

      const input = new TextInputBuilder()
        .setCustomId('edit_value')
        .setStyle(action === 'text' ? TextInputStyle.Paragraph : TextInputStyle.Paragraph)
        .setRequired(false);

      if (action === 'text') {
        input.setLabel('New message content').setPlaceholder('Type the updated text here...').setMaxLength(4000);
      } else {
        input.setLabel('Buttons — one per line: Text | URL | emoji')
          .setPlaceholder('Visit Website | https://example.com | 🌐\nJoin Discord | https://discord.gg/abc | 👾\n(leave empty to remove all buttons)')
          .setMaxLength(1000);
      }

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    // Direct edits (no modal needed)
    await interaction.deferReply({ ephemeral: true });
    await applyEdit(interaction, client, parsed, action, value);
  },

  async handleModal(interaction, client) {
    await interaction.deferReply({ ephemeral: true });
    const value  = interaction.fields.getTextInputValue('edit_value') || null;
    const opts   = client._editOptions?.[interaction.user.id] || {};
    const { parsed, action } = opts;

    if (!parsed) return interaction.editReply('❌ Something went wrong. Try the command again.');
    delete client._editOptions[interaction.user.id];
    await applyEdit(interaction, client, parsed, action, value);
  },
};

async function applyEdit(interaction, client, parsed, action, value) {
  try {
    const channel = await client.channels.fetch(parsed.channelId);
    const message = await channel.messages.fetch(parsed.messageId);

    if (message.author.id !== client.user.id) {
      return interaction.editReply('❌ That message wasn\'t sent by the bot so I can\'t edit it.');
    }

    const existingEmbed = message.embeds?.[0];
    const messageOptions = {};

    if (action === 'remove_buttons') {
      // Just clear components
      messageOptions.components = [];
      await message.edit(messageOptions);
      return interaction.editReply('✅ Buttons removed.');
    }

    if (action === 'buttons') {
      const buttons = parseButtons(value);
      const buttonRow = buildButtonRow(buttons);
      messageOptions.components = buttonRow ? [buttonRow] : [];
      await message.edit(messageOptions);
      return interaction.editReply(buttons.length ? `✅ Updated ${buttons.length} button(s).` : '✅ Buttons removed.');
    }

    // For embed edits, rebuild the embed with the change applied
    if (existingEmbed) {
      const embed = EmbedBuilder.from(existingEmbed);

      if (action === 'text')      { value ? embed.setDescription(value) : embed.setDescription(null); }
      if (action === 'title')     { value ? embed.setTitle(value) : embed.setTitle(null); }
      if (action === 'footer')    { value ? embed.setFooter({ text: value }) : embed.setFooter(null); }
      if (action === 'image')     { value ? embed.setImage(value) : embed.setImage(null); }
      if (action === 'thumbnail') { value ? embed.setThumbnail(value) : embed.setThumbnail(null); }
      if (action === 'color') {
        if (value) {
          const parsed2 = parseInt(value.replace('#', ''), 16);
          if (!isNaN(parsed2)) embed.setColor(parsed2);
        }
      }

      messageOptions.embeds = [embed];
    } else {
      // Plain message — only text edits make sense
      if (action === 'text' && value) {
        messageOptions.content = value;
      } else if (action === 'image') {
        // Add an image embed to a plain message
        if (value) {
          const embed = new EmbedBuilder().setImage(value);
          messageOptions.embeds = [embed];
        } else {
          messageOptions.embeds = [];
        }
      } else {
        return interaction.editReply('⚠️ That option only works on embed messages. Use `/draft` with style: Embed first.');
      }
    }

    await message.edit(messageOptions);
    await interaction.editReply('✅ Message updated.');
  } catch (err) {
    console.error('Edit error:', err);
    if (err.code === 10008) return interaction.editReply('❌ Message not found. Make sure the link is correct.');
    if (err.code === 50005) return interaction.editReply('❌ Can\'t edit that message — it wasn\'t sent by the bot.');
    await interaction.editReply('❌ Something went wrong editing the message.');
  }
}

const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel],
});

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const CONFIG = {
  TICKET_CATEGORY_NAME: "🎫 TICKETS",          // Category where tickets are created
  SUPPORT_ROLE_NAME: "Support",                 // Role that can see / close tickets
  TRANSCRIPT_CHANNEL_ID: "1463576830245208194", // Channel to send transcripts to
  TICKET_COOLDOWN_MS: 10_000,                   // 10s cooldown between opens
};

const cooldowns = new Map();
const openTickets = new Map(); // userId -> channelId

// ─── SLASH COMMANDS ───────────────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName("ticket-panel")
    .setDescription("Send the ticket panel to this channel (Admin only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("close")
    .setDescription("Close the current ticket"),
  new SlashCommandBuilder()
    .setName("add")
    .setDescription("Add a user to this ticket")
    .addUserOption(opt => opt.setName("user").setDescription("User to add").setRequired(true)),
  new SlashCommandBuilder()
    .setName("remove")
    .setDescription("Remove a user from this ticket")
    .addUserOption(opt => opt.setName("user").setDescription("User to remove").setRequired(true)),
].map(cmd => cmd.toJSON());

// ─── READY ────────────────────────────────────────────────────────────────────
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ Slash commands registered globally.");
  } catch (err) {
    console.error("❌ Failed to register commands:", err);
  }
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────
async function getOrCreateCategory(guild) {
  let cat = guild.channels.cache.find(
    c => c.type === ChannelType.GuildCategory && c.name === CONFIG.TICKET_CATEGORY_NAME
  );
  if (!cat) {
    cat = await guild.channels.create({
      name: CONFIG.TICKET_CATEGORY_NAME,
      type: ChannelType.GuildCategory,
    });
  }
  return cat;
}

function getSupportRole(guild) {
  return guild.roles.cache.find(r => r.name === CONFIG.SUPPORT_ROLE_NAME);
}

async function createTicketChannel(guild, user, type) {
  const category = await getOrCreateCategory(guild);
  const supportRole = getSupportRole(guild);

  const channelName = `${type === "purchase" ? "purchase" : "support"}-${user.username}`;

  const permissionOverwrites = [
    {
      id: guild.roles.everyone,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    },
    {
      id: client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
      ],
    },
  ];

  if (supportRole) {
    permissionOverwrites.push({
      id: supportRole.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.AttachFiles,
      ],
    });
  }

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites,
    topic: `Ticket for ${user.tag} | Type: ${type}`,
  });

  return channel;
}

function buildWelcomeEmbed(user, type) {
  const isPurchase = type === "purchase";

  const embed = new EmbedBuilder()
    .setColor(isPurchase ? 0x2ecc71 : 0x3498db)
    .setTitle(isPurchase ? "🛒 Purchase Ticket" : "🛠️ Support Ticket")
    .setDescription(
      isPurchase
        ? [
            `Welcome ${user}, thank you for opening a **Purchase Ticket**!`,
            "",
            "A staff member will be with you shortly.",
            "",
            "**Please provide the following:**",
            "> • Which script(s) are you interested in?",
            "> • Your payment method",
            "> • Any questions about pricing or features",
          ].join("\n")
        : [
            `Welcome ${user}, thank you for opening a **Support Ticket**!`,
            "",
            "A staff member will be with you shortly.",
            "",
            "**Please describe your issue:**",
            "> • What product are you having trouble with?",
            "> • What steps have you already tried?",
            "> • Any error messages you received",
            "",
            "📌 *For partnership or reselling inquiries, please state your interest clearly.*",
          ].join("\n")
    )
    .setFooter({ text: "Warren's Script Shop • To close this ticket, click the button below." })
    .setTimestamp();

  return embed;
}

function buildCloseRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("close_ticket")
      .setLabel("🔒 Close Ticket")
      .setStyle(ButtonStyle.Danger)
  );
}

// ─── PANEL ────────────────────────────────────────────────────────────────────
async function sendTicketPanel(channel) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🎫  Warren's Script Shop — Tickets")
    .setDescription(
      [
        "## 🛒 Purchase Tickets",
        "**If you need help with purchasing or have questions about pricing, open a Purchase Ticket.**",
        "",
        "> • Browse available scripts and ask about features",
        "> • Get a custom quote for bulk purchases",
        "> • Resolve payment issues or order questions",
        "> • Request a specific script not listed in the shop",
        "",
        "## 🛠️ Support Tickets",
        "**If you need help or general support in the server, open a Support Ticket.**",
        "",
        "> • Get help with installing or configuring a script",
        "> • Report bugs or unexpected behavior",
        "> • Ask about compatibility with your server setup",
        "",
        "**Support tickets can also be opened for partnerships or reselling.**",
        "> • Interested in becoming a reseller? Let us know!",
        "> • Partnership inquiries are always welcome",
        "",
        "─────────────────────────────",
        "*Click a button below to open a ticket. Staff will respond as soon as possible.*",
      ].join("\n")
    )
    .setFooter({ text: "Warren's Script Shop" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("open_purchase")
      .setLabel("🛒 Purchase Ticket")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("open_support")
      .setLabel("🛠️ Support Ticket")
      .setStyle(ButtonStyle.Primary)
  );

  await channel.send({ embeds: [embed], components: [row] });
}

// ─── INTERACTIONS ─────────────────────────────────────────────────────────────
client.on("interactionCreate", async interaction => {
  // ── Slash: /ticket-panel ──
  if (interaction.isChatInputCommand() && interaction.commandName === "ticket-panel") {
    await sendTicketPanel(interaction.channel);
    await interaction.reply({ content: "✅ Ticket panel sent!", ephemeral: true });
    return;
  }

  // ── Slash: /close ──
  if (interaction.isChatInputCommand() && interaction.commandName === "close") {
    await handleClose(interaction);
    return;
  }

  // ── Slash: /add ──
  if (interaction.isChatInputCommand() && interaction.commandName === "add") {
    const channel = interaction.channel;
    const user = interaction.options.getUser("user");
    if (!channel.topic?.startsWith("Ticket for")) {
      return interaction.reply({ content: "❌ This is not a ticket channel.", ephemeral: true });
    }
    await channel.permissionOverwrites.create(user, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    });
    await interaction.reply({ content: `✅ Added ${user} to the ticket.` });
    return;
  }

  // ── Slash: /remove ──
  if (interaction.isChatInputCommand() && interaction.commandName === "remove") {
    const channel = interaction.channel;
    const user = interaction.options.getUser("user");
    if (!channel.topic?.startsWith("Ticket for")) {
      return interaction.reply({ content: "❌ This is not a ticket channel.", ephemeral: true });
    }
    await channel.permissionOverwrites.delete(user);
    await interaction.reply({ content: `✅ Removed ${user} from the ticket.` });
    return;
  }

  // ── Button: open_purchase / open_support ──
  if (interaction.isButton() && (interaction.customId === "open_purchase" || interaction.customId === "open_support")) {
    const type = interaction.customId === "open_purchase" ? "purchase" : "support";
    const user = interaction.user;
    const guild = interaction.guild;

    // Cooldown check
    const lastOpen = cooldowns.get(user.id);
    if (lastOpen && Date.now() - lastOpen < CONFIG.TICKET_COOLDOWN_MS) {
      return interaction.reply({ content: "⏳ Please wait a moment before opening another ticket.", ephemeral: true });
    }

    // Already open check
    if (openTickets.has(user.id)) {
      const existing = guild.channels.cache.get(openTickets.get(user.id));
      if (existing) {
        return interaction.reply({
          content: `❌ You already have an open ticket: ${existing}`,
          ephemeral: true,
        });
      } else {
        openTickets.delete(user.id);
      }
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const channel = await createTicketChannel(guild, user, type);
      openTickets.set(user.id, channel.id);
      cooldowns.set(user.id, Date.now());

      const welcomeEmbed = buildWelcomeEmbed(user, type);
      await channel.send({
        content: `${user}`,
        embeds: [welcomeEmbed],
        components: [buildCloseRow()],
      });

      await interaction.editReply({ content: `✅ Your ticket has been created: ${channel}` });
    } catch (err) {
      console.error("Error creating ticket:", err);
      await interaction.editReply({ content: "❌ Failed to create ticket. Please contact an admin." });
    }
    return;
  }

  // ── Button: close_ticket ──
  if (interaction.isButton() && interaction.customId === "close_ticket") {
    await handleClose(interaction);
    return;
  }
});

// ─── TRANSCRIPT HELPER ────────────────────────────────────────────────────────
async function generateTranscript(channel) {
  const messages = [];
  let lastId;

  // Fetch all messages in batches of 100
  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, ...(lastId && { before: lastId }) });
    if (batch.size === 0) break;
    messages.push(...batch.values());
    lastId = batch.last().id;
    if (batch.size < 100) break;
  }

  messages.reverse(); // oldest first

  const lines = messages.map(m => {
    const time = new Date(m.createdTimestamp).toLocaleString("en-GB", { timeZone: "UTC" });
    const attachments = m.attachments.size > 0
      ? "\n  📎 " + m.attachments.map(a => a.url).join("\n  📎 ")
      : "";
    return `[${time} UTC] ${m.author.tag}: ${m.content || "(no text)"}${attachments}`;
  });

  return lines.join("\n");
}

// ─── CLOSE HANDLER ────────────────────────────────────────────────────────────
async function handleClose(interaction) {
  const channel = interaction.channel;

  if (!channel.topic?.startsWith("Ticket for")) {
    return interaction.reply({ content: "❌ This is not a ticket channel.", ephemeral: true });
  }

  const supportRole = getSupportRole(interaction.guild);
  const isSupport = supportRole && interaction.member.roles.cache.has(supportRole.id);
  const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

  // Extract ticket owner from topic: "Ticket for UserTag | Type: ..."
  const ticketOwnerTag = channel.topic.replace("Ticket for ", "").split(" | ")[0];
  const isOwner = interaction.user.tag === ticketOwnerTag;

  if (!isSupport && !isAdmin && !isOwner) {
    return interaction.reply({ content: "❌ You don't have permission to close this ticket.", ephemeral: true });
  }

  await interaction.deferReply();

  // Generate transcript
  const transcriptText = await generateTranscript(channel);
  const transcriptBuffer = Buffer.from(transcriptText, "utf-8");
  const fileName = `transcript-${channel.name}-${Date.now()}.txt`;

  const transcriptEmbed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle("📄 Ticket Transcript")
    .addFields(
      { name: "Ticket", value: channel.name, inline: true },
      { name: "Closed by", value: `${interaction.user.tag}`, inline: true },
      { name: "Ticket Owner", value: ticketOwnerTag, inline: true },
      { name: "Closed at", value: new Date().toLocaleString("en-GB", { timeZone: "UTC" }) + " UTC", inline: false },
    )
    .setFooter({ text: "Warren's Script Shop" })
    .setTimestamp();

  const attachmentFile = { attachment: transcriptBuffer, name: fileName };

  // Send to transcript channel
  try {
    const transcriptChannel = await interaction.guild.channels.fetch(CONFIG.TRANSCRIPT_CHANNEL_ID);
    if (transcriptChannel) {
      await transcriptChannel.send({ embeds: [transcriptEmbed], files: [attachmentFile] });
    }
  } catch (err) {
    console.error("Could not send to transcript channel:", err);
  }

  // DM the ticket owner
  try {
    const members = await interaction.guild.members.fetch();
    const ownerMember = members.find(m => m.user.tag === ticketOwnerTag);
    if (ownerMember) {
      await ownerMember.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("🔒 Your ticket has been closed")
            .setDescription(`Your ticket **${channel.name}** in **${interaction.guild.name}** was closed by **${interaction.user.tag}**.\n\nA transcript of your conversation is attached below.`)
            .setFooter({ text: "Warren's Script Shop" })
            .setTimestamp()
        ],
        files: [{ attachment: Buffer.from(transcriptText, "utf-8"), name: fileName }]
      });
    }
  } catch (err) {
    console.error("Could not DM ticket owner:", err);
  }

  const closeEmbed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle("🔒 Ticket Closing")
    .setDescription(`This ticket was closed by ${interaction.user}.\nTranscript saved. Channel will be deleted in **5 seconds**.`)
    .setTimestamp();

  await interaction.editReply({ embeds: [closeEmbed] });

  // Remove ticket from openTickets map
  for (const [uid, cid] of openTickets.entries()) {
    if (cid === channel.id) openTickets.delete(uid);
  }

  setTimeout(() => channel.delete().catch(console.error), 5000);
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
client.login(process.env.BOT_TOKEN);

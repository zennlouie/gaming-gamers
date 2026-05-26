const dotenv = require('dotenv');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
} = require('discord.js');

const { GAME_TEMPLATES, getAllTemplates, getTemplateChoices } = require('./templates');
const { loadData, saveData } = require('./storage');

dotenv.config();

const token = process.env.TOKEN;

if (!token) {
  throw new Error('Missing TOKEN in .env');
}

const data = loadData();
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});
const AUTO_REINVITE_INTERVAL_MS = 30 * 1000;
const DEFAULT_TIMEZONE_OFFSET_MINUTES = new Date().getTimezoneOffset() * -1;

function makeQueueId(queueId) {
  return `queue:${queueId}`;
}

function createQueueId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getTemplateByKey(templateKey) {
  const templates = getAllTemplates(data.customTemplates);

  if (templates[templateKey]) {
    return templates[templateKey];
  }

  return Object.values(templates).find(
    (template) => template.key === templateKey,
  );
}

function normalizeTemplateKey(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function formatUsers(userIds) {
  return userIds.length ? userIds.map((id) => `<@${id}>`).join('\n') : 'No one yet';
}

function getJoinedUserIds(queue) {
  return [...queue.primaryUsers, ...queue.secondaryUsers];
}

function isQueueReady(queue) {
  return getJoinedUserIds(queue).length >= queue.targetSize;
}

function formatTimezoneLabel(offsetMinutes) {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;

  if (minutes === 0) {
    return `GMT${sign}${hours}`;
  }

  return `GMT${sign}${hours}:${String(minutes).padStart(2, '0')}`;
}

function parseTimezoneOffset(input) {
  if (!input) {
    return null;
  }

  const normalized = input.trim().toUpperCase().replace(/^UTC/, 'GMT');
  const match = normalized.match(/^GMT\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) {
    return null;
  }

  const hours = Number(match[2]);
  const minutes = Number(match[3] || '0');

  if (hours > 14 || minutes > 59) {
    return null;
  }

  const totalMinutes = (hours * 60) + minutes;
  return match[1] === '+' ? totalMinutes : -totalMinutes;
}

function getGuildSettings(guildId) {
  if (!guildId) {
    return {};
  }

  return data.guildSettings[guildId] || {};
}

function getGuildTimezoneOffsetMinutes(guildId) {
  const configuredOffset = getGuildSettings(guildId).timezoneOffsetMinutes;
  return Number.isInteger(configuredOffset) ? configuredOffset : DEFAULT_TIMEZONE_OFFSET_MINUTES;
}

function formatQueueTime(queue) {
  if (!queue.scheduledFor) {
    return 'Now';
  }

  const scheduledDate = new Date(queue.scheduledFor);
  if (Number.isNaN(scheduledDate.getTime())) {
    return 'Now';
  }

  const offsetMinutes = Number.isInteger(queue.timezoneOffsetMinutes)
    ? queue.timezoneOffsetMinutes
    : DEFAULT_TIMEZONE_OFFSET_MINUTES;
  const timezoneLabel = queue.timezoneLabel || formatTimezoneLabel(offsetMinutes);
  const shiftedDate = new Date(scheduledDate.getTime() + (offsetMinutes * 60 * 1000));
  const month = shiftedDate.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const day = shiftedDate.toLocaleString('en-US', { day: 'numeric', timeZone: 'UTC' });
  const time = shiftedDate.toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  });

  return `${month} ${day}, ${time} ${timezoneLabel}`;
}

function parseScheduledTime(input, offsetMinutes = DEFAULT_TIMEZONE_OFFSET_MINUTES) {
  if (!input) {
    return null;
  }

  const match = input.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) {
    return null;
  }

  const now = new Date();
  const timezoneNow = new Date(now.getTime() + (offsetMinutes * 60 * 1000));
  const scheduledYear = timezoneNow.getUTCFullYear();
  const scheduledMonth = timezoneNow.getUTCMonth();
  const scheduledDay = timezoneNow.getUTCDate();
  let scheduledUtcMs = Date.UTC(
    scheduledYear,
    scheduledMonth,
    scheduledDay,
    hours,
    minutes,
    0,
    0,
  ) - (offsetMinutes * 60 * 1000);

  if (scheduledUtcMs < now.getTime()) {
    scheduledUtcMs += 24 * 60 * 60 * 1000;
  }

  return new Date(scheduledUtcMs);
}

function buildHelpMessage() {
  const templateList = Object.values(getAllTemplates(data.customTemplates))
    .map((template) => `\`${template.key}\``)
    .join(', ');

  return [
    '**Gaming Gamers Help**',
    '',
    '`/invite game:<template> note:<optional> time:<HH:mm> size:<optional>`',
    'Creates a queue post and pings the configured role for that game.',
    '',
    '`/settimezone timezone:<GMT+8>`',
    'Sets the timezone used for invite times in this server.',
    '',
    '`/creategame name:<game name> size:<players> key:<optional>`',
    'Adds a new game template that becomes available in `/invite`.',
    '',
    '`/removegame game:<template>`',
    'Removes a custom game template when no active queue is using it.',
    '',
    '`/setrole game:<template> role:@Role`',
    'Sets which role gets pinged for a game template.',
    '',
    '`/queueconfig`',
    'Shows the current role mapping for each game.',
    '',
    '`Join Queue` adds you to the main lineup.',
    '`Join Sub` adds you as a sub.',
    '`Reinvite` resends the current invite and pings the role again.',
    '`Start Game` pings everyone currently in the queue, and only the host can use it.',
    '`Cancel Invite` removes the queue, and only the host can use it.',
    'If `time` is set and the queue is still not full when that time arrives, the bot auto-reinvites once.',
    '',
    `Available templates: ${templateList}`,
  ].join('\n');
}

function buildQueueEmbed(queue) {
  const template = getTemplateByKey(queue.templateKey);
  const filled = `${getJoinedUserIds(queue).length}/${queue.targetSize}`;
  const reinviteValue = queue.lastReinvitedByUserId
    ? `<@${queue.lastReinvitedByUserId}>`
    : queue.autoReinvitedAt
      ? 'Auto-reinvited by the bot'
      : null;
  const statusValue = queue.canceledAt
    ? `Canceled by <@${queue.canceledByUserId || queue.hostUserId}>`
    : isQueueReady(queue)
      ? 'Ready / Full'
      : 'Looking for players';

  const embed = new EmbedBuilder()
    .setTitle(`${template.name} Queue`)
    .setDescription(queue.note || null)
    .setColor(0xf97316)
    .addFields(
      { name: 'WALANG TRABAHONG NAG AYA', value: `<@${queue.hostUserId}>`, inline: true },
      { name: 'Game Time', value: formatQueueTime(queue), inline: true },
      { name: 'Queue Size', value: filled, inline: true },
      { name: 'Status', value: statusValue, inline: true },
      ...(reinviteValue ? [{ name: 'Reinvited By', value: reinviteValue, inline: true }] : []),
      { name: 'Queue', value: formatUsers(queue.primaryUsers), inline: false },
      { name: 'SUB', value: formatUsers(queue.secondaryUsers), inline: false },
    )
    .setFooter({ text: `Template: ${template.key}` })
    .setTimestamp(new Date(queue.createdAt));

  return embed;
}

function buildQueueComponents(queue) {
  const template = getTemplateByKey(queue.templateKey);
  const messageKey = makeQueueId(queue.queueId);

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${messageKey}:primary`)
        .setLabel(template.primaryButtonLabel)
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${messageKey}:secondary`)
        .setLabel(template.secondaryButtonLabel)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${messageKey}:leave`)
        .setLabel('Leave Queue')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${messageKey}:reinvite`)
        .setLabel('Reinvite')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`${messageKey}:start`)
        .setLabel('Start Game')
        .setStyle(ButtonStyle.Success),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${messageKey}:cancel`)
        .setLabel('Cancel Invite')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function buildAllowedMentions(queue) {
  return { roles: queue.roleMention ? [queue.roleMention.replace(/\D/g, '')] : [] };
}

async function syncQueueMessage(queue) {
  try {
    const channel = await client.channels.fetch(queue.channelId);
    if (!channel?.isTextBased()) {
      return;
    }

    const message = await channel.messages.fetch(queue.messageId);
    await message.edit({
      content: queue.roleMention || null,
      embeds: [buildQueueEmbed(queue)],
      components: buildQueueComponents(queue),
      allowedMentions: buildAllowedMentions(queue),
    });
  } catch (error) {
    console.error('Failed to sync queue message', error);
  }
}

async function resendQueueInvite(queue, reinvitedByUserId = null) {
  const channel = await client.channels.fetch(queue.channelId);
  if (!channel?.isTextBased()) {
    throw new Error('Queue channel is not text based.');
  }

  queue.lastReinvitedByUserId = reinvitedByUserId;
  const previousMessageId = queue.messageId;
  const resentMessage = await channel.send({
    content: queue.roleMention || undefined,
    embeds: [buildQueueEmbed(queue)],
    components: buildQueueComponents(queue),
    allowedMentions: buildAllowedMentions(queue),
  });

  queue.messageId = resentMessage.id;

  if (previousMessageId && previousMessageId !== resentMessage.id) {
    try {
      const previousMessage = await channel.messages.fetch(previousMessageId);
      await previousMessage.edit({
        content: 'Invite moved to the latest reinvite.',
        embeds: [buildQueueEmbed(queue)],
        components: [],
        allowedMentions: { roles: [] },
      });
    } catch (error) {
      console.error('Failed to archive previous queue message', error);
    }
  }

  return resentMessage;
}

async function cancelQueueInvite(queue, canceledByUserId) {
  const channel = await client.channels.fetch(queue.channelId);
  if (!channel?.isTextBased()) {
    throw new Error('Queue channel is not text based.');
  }

  queue.canceledAt = new Date().toISOString();
  queue.canceledByUserId = canceledByUserId;
  queue.shouldAutoReinvite = false;

  const message = await channel.messages.fetch(queue.messageId);
  await message.edit({
    content: 'Invite canceled.',
    embeds: [buildQueueEmbed(queue)],
    components: [],
    allowedMentions: { roles: [] },
  });

  delete data.queues[makeQueueId(queue.queueId)];
}

async function handleScheduledReinvite(queue) {
  if (!queue.shouldAutoReinvite || queue.autoReinvitedAt || !queue.scheduledFor) {
    return;
  }

  const scheduledAt = new Date(queue.scheduledFor);
  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() > Date.now()) {
    return;
  }

  queue.autoReinvitedAt = new Date().toISOString();

  if (isQueueReady(queue)) {
    saveData(data);
    return;
  }

  try {
    await resendQueueInvite(queue);
    saveData(data);
  } catch (error) {
    queue.autoReinvitedAt = null;
    console.error('Failed to auto-reinvite queue', error);
  }
}

function startAutoReinviteLoop() {
  setInterval(() => {
    Object.values(data.queues).forEach((queue) => {
      void handleScheduledReinvite(queue);
    });
  }, AUTO_REINVITE_INTERVAL_MS);
}

async function announceQueue(queue, messageText) {
  try {
    const channel = await client.channels.fetch(queue.channelId);
    if (!channel?.isTextBased()) {
      return;
    }

    const mentions = getJoinedUserIds(queue).map((id) => `<@${id}>`).join(' ');
    if (!mentions) {
      return;
    }

    await channel.send({
      content: `${mentions} ${messageText}`,
      allowedMentions: { users: getJoinedUserIds(queue) },
    });
  } catch (error) {
    console.error('Failed to announce queue', error);
  }
}

async function announceQueueReady(queue) {
  await announceQueue(queue, 'GAME NA MGA TANGA!!!');
}

async function announceQueueStart(queue, startedByUserId) {
  await announceQueue(queue, `Game starting now, called by <@${startedByUserId}>!`);
}

function removeUserFromQueue(queue, userId) {
  queue.primaryUsers = queue.primaryUsers.filter((id) => id !== userId);
  queue.secondaryUsers = queue.secondaryUsers.filter((id) => id !== userId);
}

function addUserToQueue(queue, userId, lane) {
  removeUserFromQueue(queue, userId);

  if (lane === 'primary') {
    queue.primaryUsers.push(userId);
    return 'Joined the main queue.';
  }

  if (lane === 'secondary') {
    queue.secondaryUsers.push(userId);
    return 'Joined the overflow / non-priority queue.';
  }

  return 'No change made.';
}

async function createQueueFromCommand(interaction) {
  const templateKey = interaction.options.getString('game', true);
  const template = getTemplateByKey(templateKey);

  if (!template) {
    await interaction.reply({
      content: 'That game template no longer exists. Restart the bot and try the updated slash command.',
      ephemeral: true,
    });
    return;
  }

  const note = interaction.options.getString('note') || '';
  const size = interaction.options.getInteger('size') || template.size;
  const timeInput = interaction.options.getString('time');
  const timezoneOffsetMinutes = getGuildTimezoneOffsetMinutes(interaction.guildId);
  const timezoneLabel = formatTimezoneLabel(timezoneOffsetMinutes);
  const scheduledDate = timeInput ? parseScheduledTime(timeInput, timezoneOffsetMinutes) : new Date();

  if (timeInput && !scheduledDate) {
    await interaction.reply({
      content: `Time must be in \`HH:mm\` 24-hour format, like \`19:30\`. It will be interpreted as ${timezoneLabel}.`,
      ephemeral: true,
    });
    return;
  }

  const roleId = data.roleMappings[interaction.guildId]?.[template.key] || null;
  const roleMention = roleId ? `<@&${roleId}>` : null;

  const queue = {
    queueId: createQueueId(),
    templateKey: template.key,
    hostUserId: interaction.user.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    messageId: null,
    targetSize: size,
    note,
    primaryUsers: [interaction.user.id],
    secondaryUsers: [],
    createdAt: new Date().toISOString(),
    scheduledFor: scheduledDate.toISOString(),
    timezoneOffsetMinutes,
    timezoneLabel,
    shouldAutoReinvite: Boolean(timeInput),
    autoReinvitedAt: null,
    roleMention,
    readyAnnounced: false,
  };

  const reply = await interaction.reply({
    content: roleMention || undefined,
    embeds: [buildQueueEmbed(queue)],
    components: buildQueueComponents(queue),
    allowedMentions: { roles: roleId ? [roleId] : [] },
    fetchReply: true,
  });

  queue.messageId = reply.id;

  data.queues[makeQueueId(queue.queueId)] = queue;
  saveData(data);
}

async function createTemplateFromCommand(interaction) {
  const name = interaction.options.getString('name', true).trim();
  const size = interaction.options.getInteger('size', true);
  const keyInput = interaction.options.getString('key');
  const key = normalizeTemplateKey(keyInput || name);

  if (!key) {
    await interaction.reply({
      content: 'Game name or key must include letters or numbers.',
      ephemeral: true,
    });
    return;
  }

  if (getTemplateByKey(key)) {
    await interaction.reply({
      content: `A game template with key \`${key}\` already exists.`,
      ephemeral: true,
    });
    return;
  }

  data.customTemplates[key] = {
    key,
    name: name.toUpperCase(),
    size,
    primaryButtonLabel: 'Join Queue',
    secondaryButtonLabel: 'Join Sub',
  };
  saveData(data);

  await registerCommands();

  await interaction.reply({
    content: `Created game template **${name.toUpperCase()}** with key \`${key}\` and default size ${size}. You can now use \`/invite game:${key}\`.`,
    ephemeral: true,
  });
}

async function removeTemplateFromCommand(interaction) {
  const templateKey = interaction.options.getString('game', true);
  const template = getTemplateByKey(templateKey);

  if (!template || !data.customTemplates[template.key]) {
    await interaction.reply({
      content: 'Only custom game templates can be removed.',
      ephemeral: true,
    });
    return;
  }

  const activeQueue = Object.values(data.queues).find((queue) => queue.templateKey === template.key);
  if (activeQueue) {
    await interaction.reply({
      content: `Cannot remove \`${template.key}\` while an active queue is using it.`,
      ephemeral: true,
    });
    return;
  }

  delete data.customTemplates[template.key];

  Object.values(data.roleMappings).forEach((guildRoleMappings) => {
    if (guildRoleMappings) {
      delete guildRoleMappings[template.key];
    }
  });

  saveData(data);
  await registerCommands();

  await interaction.reply({
    content: `Removed custom game template **${template.name}** (\`${template.key}\`).`,
    ephemeral: true,
  });
}

async function setTimezoneFromCommand(interaction) {
  const timezoneInput = interaction.options.getString('timezone', true);
  const timezoneOffsetMinutes = parseTimezoneOffset(timezoneInput);

  if (timezoneOffsetMinutes === null) {
    await interaction.reply({
      content: 'Timezone must look like `GMT+8`, `GMT-5`, or `GMT+5:30`.',
      ephemeral: true,
    });
    return;
  }

  if (!data.guildSettings[interaction.guildId]) {
    data.guildSettings[interaction.guildId] = {};
  }

  data.guildSettings[interaction.guildId].timezoneOffsetMinutes = timezoneOffsetMinutes;
  saveData(data);

  await interaction.reply({
    content: `All new invites in this server will now use **${formatTimezoneLabel(timezoneOffsetMinutes)}**.`,
    ephemeral: true,
  });
}

function buildCommands() {
  const templateChoices = getTemplateChoices(data.customTemplates);

  return [
    new SlashCommandBuilder()
      .setName('invite')
      .setDescription('Create a game invite queue from a template.')
      .addStringOption((option) =>
        option
          .setName('game')
          .setDescription('Which game template to use')
          .setRequired(true)
          .addChoices(...templateChoices),
      )
      .addStringOption((option) =>
        option
          .setName('note')
          .setDescription('Optional details like mode, rank, map, or time')
          .setRequired(false),
      )
      .addStringOption((option) =>
        option
          .setName('time')
          .setDescription('Optional game time in 24-hour HH:mm format using this server timezone')
          .setRequired(false),
      )
      .addIntegerOption((option) =>
        option
          .setName('size')
          .setDescription('Override the default team size for this queue')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(20),
      ),
    new SlashCommandBuilder()
      .setName('settimezone')
      .setDescription('Set the timezone used for invite times in this server.')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addStringOption((option) =>
        option
          .setName('timezone')
          .setDescription('Examples: GMT+8, GMT-5, GMT+5:30')
          .setRequired(true),
      ),
    new SlashCommandBuilder()
      .setName('creategame')
      .setDescription('Create a new game template for future invites.')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addStringOption((option) =>
        option
          .setName('name')
          .setDescription('Display name for the new game')
          .setRequired(true),
      )
      .addIntegerOption((option) =>
        option
          .setName('size')
          .setDescription('Default queue size for this game')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(20),
      )
      .addStringOption((option) =>
        option
          .setName('key')
          .setDescription('Optional short key for slash commands, like marvel-rivals')
          .setRequired(false),
      ),
    new SlashCommandBuilder()
      .setName('removegame')
      .setDescription('Remove a custom game template.')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addStringOption((option) =>
        option
          .setName('game')
          .setDescription('Which custom game template to remove')
          .setRequired(true)
          .addChoices(...templateChoices),
      ),
    new SlashCommandBuilder()
      .setName('setrole')
      .setDescription('Set which role gets pinged for a game template.')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addStringOption((option) =>
        option
          .setName('game')
          .setDescription('Which game template to configure')
          .setRequired(true)
          .addChoices(...templateChoices),
      )
      .addRoleOption((option) =>
        option
          .setName('role')
          .setDescription('Role to ping when this game queue is created')
          .setRequired(true),
      ),
    new SlashCommandBuilder()
      .setName('queueconfig')
      .setDescription('View the role mapping for all game templates.'),
    new SlashCommandBuilder()
      .setName('help')
      .setDescription('Show the available commands and queue actions.'),
  ].map((command) => command.toJSON());
}

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(token);
  await rest.put(Routes.applicationCommands(client.user.id), {
    body: buildCommands(),
  });
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  await registerCommands();
  startAutoReinviteLoop();
  console.log('Slash commands registered.');
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (!interaction.inGuild()) {
        await interaction.reply({
          content: 'This bot only works inside a server.',
          ephemeral: true,
        });
        return;
      }

      if (interaction.commandName === 'setrole') {
        const templateKey = interaction.options.getString('game', true);
        const template = getTemplateByKey(templateKey);
        const role = interaction.options.getRole('role', true);

        if (!template) {
          await interaction.reply({
            content: 'That game template no longer exists. Restart the bot and try the updated slash command.',
            ephemeral: true,
          });
          return;
        }

        data.roleMappings[interaction.guildId] ??= {};
        data.roleMappings[interaction.guildId][template.key] = role.id;
        saveData(data);

        await interaction.reply({
          content: `Set ${template.name} ping role to ${role}.`,
          ephemeral: true,
        });
        return;
      }

      if (interaction.commandName === 'queueconfig') {
        const guildRoleMappings = data.roleMappings[interaction.guildId] || {};
        const timezoneLabel = formatTimezoneLabel(getGuildTimezoneOffsetMinutes(interaction.guildId));
        const lines = Object.values(getAllTemplates(data.customTemplates)).map((template) => {
          const roleId = guildRoleMappings[template.key];
          return roleId
            ? `- **${template.name}**: <@&${roleId}>`
            : `- **${template.name}**: Not configured`;
        });
        const message = [
          '**Queue role config**',
          `Timezone: **${timezoneLabel}**`,
          ...lines,
        ].join('\n');

        await interaction.reply({
          content: message,
          ephemeral: true,
        });
        return;
      }

      if (interaction.commandName === 'help') {
        await interaction.reply({
          content: buildHelpMessage(),
          ephemeral: true,
        });
        return;
      }

      if (interaction.commandName === 'creategame') {
        await createTemplateFromCommand(interaction);
        return;
      }

      if (interaction.commandName === 'removegame') {
        await removeTemplateFromCommand(interaction);
        return;
      }

      if (interaction.commandName === 'settimezone') {
        await setTimezoneFromCommand(interaction);
        return;
      }

      if (interaction.commandName === 'invite') {
        await createQueueFromCommand(interaction);
        return;
      }
    }

    if (interaction.isButton()) {
      const [prefix, messageId, lane] = interaction.customId.split(':');

      if (prefix !== 'queue' || !messageId || !lane) {
        await interaction.reply({
          content: 'That queue button is invalid.',
          ephemeral: true,
        });
        return;
      }

      const queue = data.queues[`${prefix}:${messageId}`] || data.queues[makeQueueId(messageId)];

      if (!queue) {
        await interaction.reply({
          content: 'That queue is no longer active.',
          ephemeral: true,
        });
        return;
      }

      let feedback = 'No change made.';
      const wasReady = isQueueReady(queue);

      if (lane === 'reinvite') {
        await resendQueueInvite(queue, interaction.user.id);
        saveData(data);

        await interaction.reply({
          content: 'Invite resent and role pinged again.',
          ephemeral: true,
        });
        return;
      }

      if (lane === 'cancel') {
        if (interaction.user.id !== queue.hostUserId) {
          await interaction.reply({
            content: 'Only the invite host can cancel this queue.',
            ephemeral: true,
          });
          return;
        }

        await cancelQueueInvite(queue, interaction.user.id);
        saveData(data);

        await interaction.reply({
          content: 'Invite canceled.',
          ephemeral: true,
        });
        return;
      }

      if (lane === 'start') {
        if (interaction.user.id !== queue.hostUserId) {
          await interaction.reply({
            content: 'Only the invite host can start this queue.',
            ephemeral: true,
          });
          return;
        }

        await announceQueueStart(queue, interaction.user.id);
        await interaction.reply({
          content: 'Queued players have been pinged to start.',
          ephemeral: true,
        });
        return;
      }

      if (lane === 'leave') {
        removeUserFromQueue(queue, interaction.user.id);
        feedback = 'You left the queue.';
      } else if (lane === 'primary' || lane === 'secondary') {
        feedback = addUserToQueue(queue, interaction.user.id, lane);
      }

      const isReadyNow = isQueueReady(queue);
      if (!isReadyNow) {
        queue.readyAnnounced = false;
      }

      saveData(data);
      await syncQueueMessage(queue);

      if (!wasReady && isReadyNow && !queue.readyAnnounced) {
        queue.readyAnnounced = true;
        saveData(data);
        await announceQueueReady(queue);
      }

      await interaction.reply({
        content: feedback,
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error('Interaction handler failed', error);

    if (interaction.isRepliable()) {
      const payload = {
        content: 'Something went wrong while handling that command.',
        ephemeral: true,
      };

      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload).catch(() => null);
      } else {
        await interaction.reply(payload).catch(() => null);
      }
    }
  }
});

client.login(token);

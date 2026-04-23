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

const { GAME_TEMPLATES, getTemplateChoices } = require('./templates');
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

function makeQueueId(queueId) {
  return `queue:${queueId}`;
}

function createQueueId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getTemplateByKey(templateKey) {
  if (GAME_TEMPLATES[templateKey]) {
    return GAME_TEMPLATES[templateKey];
  }

  return Object.values(GAME_TEMPLATES).find(
    (template) => template.key === templateKey,
  );
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

function buildQueueEmbed(queue) {
  const template = getTemplateByKey(queue.templateKey);
  const filled = `${getJoinedUserIds(queue).length}/${queue.targetSize}`;

  const embed = new EmbedBuilder()
    .setTitle(`${template.name} Queue`)
    .setDescription(queue.note || null)
    .setColor(0xf97316)
    .addFields(
      { name: 'WALANG TRABAHONG NAG AYA', value: `<@${queue.hostUserId}>`, inline: true },
      { name: 'Queue Size', value: filled, inline: true },
      { name: 'Status', value: isQueueReady(queue) ? 'Ready / Full' : 'Looking for players', inline: true },
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
    ),
  ];
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
      allowedMentions: { roles: queue.roleMention ? [queue.roleMention.replace(/\D/g, '')] : [] },
    });
  } catch (error) {
    console.error('Failed to sync queue message', error);
  }
}

async function announceQueueReady(queue) {
  try {
    const channel = await client.channels.fetch(queue.channelId);
    if (!channel?.isTextBased()) {
      return;
    }

    const mentions = getJoinedUserIds(queue).map((id) => `<@${id}>`).join(' ');
    if (!mentions) {
      return;
    }

    const template = getTemplateByKey(queue.templateKey);
    await channel.send({
      content: `${mentions} ${template ? `GAME NA MGA TANGA!!!` : 'GAME NA MGA TANGA!!!'}`,
      allowedMentions: { users: getJoinedUserIds(queue) },
    });
  } catch (error) {
    console.error('Failed to announce ready queue', error);
  }
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

function buildCommands() {
  const templateChoices = getTemplateChoices();

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
      .addIntegerOption((option) =>
        option
          .setName('size')
          .setDescription('Override the default team size for this queue')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(20),
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
      .setDescription('View the role mapping for a game template.')
      .addStringOption((option) =>
        option
          .setName('game')
          .setDescription('Which game template to inspect')
          .setRequired(true)
          .addChoices(...templateChoices),
      ),
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
        const templateKey = interaction.options.getString('game', true);
        const template = getTemplateByKey(templateKey);

        if (!template) {
          await interaction.reply({
            content: 'That game template no longer exists. Restart the bot and try the updated slash command.',
            ephemeral: true,
          });
          return;
        }

        const roleId = data.roleMappings[interaction.guildId]?.[template.key];
        const message = roleId
          ? `${template.name} currently pings <@&${roleId}>.`
          : `${template.name} has no ping role configured yet.`;

        await interaction.reply({
          content: message,
          ephemeral: true,
        });
        return;
      }

      if (interaction.commandName === 'invite') {
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

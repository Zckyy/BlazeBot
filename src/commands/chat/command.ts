import {
  ChannelType,
  MessageFlags,
  SlashCommandBuilder,
  ThreadAutoArchiveDuration,
  type ChatInputCommandInteraction,
  type TextChannel,
} from 'discord.js';
import type { Command } from '../../types/command.js';
import { loadConfig } from '../../core/config.js';
import { logger } from '../../core/logger.js';
import {
  countActiveAiConversationsForOwner,
  countCompletedAiMessages,
  createAiConversation,
  endAiConversation,
  getActiveAiConversationByThreadId,
  resetAiConversation,
} from '../../services/database/repositories/aiChat.js';
import { askAi, continueAiConversation } from '../../services/aiChat/chat.js';
import { aiErrorMessage } from '../../services/aiChat/errors.js';
import { splitDiscordMessage } from '../../services/aiChat/format.js';
import { enqueueConversation } from '../../services/aiChat/queue.js';

const MAX_PROMPT_LENGTH = 4_000;

export const command: Command = {
  data: buildCommand(),
  async execute(interaction) {
    await executeAiCommand(interaction);
  },
};

function buildCommand() {
  return new SlashCommandBuilder()
    .setName('chat')
    .setDescription('Chat with BlazeBot AI')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('start')
        .setDescription('Start a persistent AI conversation in a new thread')
        .addStringOption((option) =>
          option
            .setName('message')
            .setDescription('Optional opening message')
            .setMaxLength(MAX_PROMPT_LENGTH),
        )
        .addBooleanOption((option) =>
          option
            .setName('search')
            .setDescription('Allow web search for the opening message (may cost extra)'),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('ask')
        .setDescription('Ask BlazeBot AI a one-off question')
        .addStringOption((option) =>
          option
            .setName('message')
            .setDescription('What you want to ask')
            .setRequired(true)
            .setMaxLength(MAX_PROMPT_LENGTH),
        )
        .addBooleanOption((option) =>
          option
            .setName('search')
            .setDescription('Allow web search for this question (may cost extra)'),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('reset').setDescription('Forget the context in this AI thread'),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('info').setDescription('Show information about this AI conversation'),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('end').setDescription('End and archive this AI conversation'),
    );
}

async function executeAiCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'AI chat currently only works in servers.' });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'start') await startConversation(interaction);
  else if (subcommand === 'ask') await askOnce(interaction);
  else if (subcommand === 'reset') await resetConversation(interaction);
  else if (subcommand === 'info') await showConversationInfo(interaction);
  else if (subcommand === 'end') await endConversation(interaction);
}

async function startConversation(interaction: ChatInputCommandInteraction): Promise<void> {
  const config = loadConfig();
  if (!config.aiChatEnabled) {
    await interaction.reply({
      content: 'AI chat is not enabled yet. An administrator needs to configure OpenRouter.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (interaction.channel?.type !== ChannelType.GuildText) {
    await interaction.reply({
      content: 'Start AI conversations from a regular server text channel.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (countActiveAiConversationsForOwner(interaction.guildId!, interaction.user.id) >= 2) {
    await interaction.reply({
      content: 'You already have two active AI conversations in this server. End one first.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const channel = interaction.channel as TextChannel;
    const safeName = interaction.user.displayName.replace(/[^\p{L}\p{N} _-]/gu, '').trim();
    const thread = await channel.threads.create({
      name: `AI — ${safeName || 'conversation'}`.slice(0, 100),
      autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
      reason: `AI conversation started by ${interaction.user.tag}`,
    });
    const conversation = createAiConversation({
      guildId: interaction.guildId!,
      parentChannelId: channel.id,
      threadId: thread.id,
      ownerUserId: interaction.user.id,
      provider: 'openrouter',
      model: config.openRouterModel,
      reasoningEffort: 'none',
    });
    await thread.send({
      content:
        `Hey <@${interaction.user.id}> — this is your BlazeBot AI conversation. ` +
        'Send normal messages here, prefix a message with `!search` for live web results, ' +
        'or use `/chat reset`, `/chat info`, and `/chat end`.',
      allowedMentions: { users: [interaction.user.id] },
    });
    await interaction.editReply(`Created your AI conversation: <#${thread.id}>`);

    const openingMessage = interaction.options.getString('message');
    if (openingMessage) {
      await thread.send({
        content: `**${interaction.user.displayName}:** ${openingMessage}`,
        allowedMentions: { parse: [] },
      });
      try {
        await withTyping(thread, async () => {
          const response = await enqueueConversation(conversation.id, () =>
            continueAiConversation(conversation, {
              discordMessageId: interaction.id,
              userId: interaction.user.id,
              message: openingMessage,
              webSearch: interaction.options.getBoolean('search') ?? false,
            }),
          );
          await sendThreadChunks(thread, response.text);
        });
      } catch (error) {
        logger.warn({ err: error, conversationId: conversation.id }, 'Opening AI message failed');
        await thread.send({ content: aiErrorMessage(error), allowedMentions: { parse: [] } });
      }
    }
  } catch (error) {
    logger.error({ err: error, userId: interaction.user.id }, 'Failed to start AI conversation');
    await interaction.editReply(aiErrorMessage(error));
  }
}

async function askOnce(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  try {
    const response = await askAi({
      guildId: interaction.guildId!,
      userId: interaction.user.id,
      message: interaction.options.getString('message', true),
      webSearch: interaction.options.getBoolean('search') ?? false,
    });
    const chunks = splitDiscordMessage(response.text);
    await interaction.editReply({ content: chunks[0], allowedMentions: { parse: [] } });
    for (const chunk of chunks.slice(1)) {
      await interaction.followUp({ content: chunk, allowedMentions: { parse: [] } });
    }
  } catch (error) {
    logger.warn({ err: error, userId: interaction.user.id }, 'One-shot AI request failed');
    await interaction.editReply(aiErrorMessage(error));
  }
}

async function resetConversation(interaction: ChatInputCommandInteraction): Promise<void> {
  const conversation = await getOwnedThreadConversation(interaction);
  if (!conversation) return;
  resetAiConversation(conversation.id);
  await interaction.reply(
    'Context reset. I have forgotten the previous conversation in this thread.',
  );
}

async function showConversationInfo(interaction: ChatInputCommandInteraction): Promise<void> {
  const conversation = await getOwnedThreadConversation(interaction);
  if (!conversation) return;
  const messageCount = countCompletedAiMessages(conversation.id, conversation.contextSegment);
  await interaction.reply({
    content: [
      `**Provider:** ${conversation.provider}`,
      `**Model:** ${conversation.model}`,
      `**Reasoning:** ${conversation.reasoningEffort}`,
      `**Remembered messages:** ${messageCount}`,
      `**Started:** <t:${Math.floor(new Date(conversation.createdAt + 'Z').getTime() / 1_000)}:R>`,
    ].join('\n'),
    flags: MessageFlags.Ephemeral,
  });
}

async function endConversation(interaction: ChatInputCommandInteraction): Promise<void> {
  const conversation = await getOwnedThreadConversation(interaction);
  if (!conversation) return;
  endAiConversation(conversation.id);
  await interaction.reply('Conversation ended. Archiving this thread.');
  if (interaction.channel?.isThread())
    await interaction.channel.setArchived(true, 'AI session ended');
}

async function getOwnedThreadConversation(interaction: ChatInputCommandInteraction) {
  const conversation = getActiveAiConversationByThreadId(interaction.channelId);
  if (!conversation) {
    await interaction.reply({
      content: 'Use this command inside an active AI conversation thread.',
      flags: MessageFlags.Ephemeral,
    });
    return undefined;
  }
  if (conversation.ownerUserId !== interaction.user.id) {
    await interaction.reply({
      content: 'Only the owner of this AI conversation can manage it.',
      flags: MessageFlags.Ephemeral,
    });
    return undefined;
  }
  return conversation;
}

async function withTyping<T extends { sendTyping(): Promise<unknown> }>(
  channel: T,
  task: () => Promise<void>,
): Promise<void> {
  await channel.sendTyping();
  const timer = setInterval(() => void channel.sendTyping(), 8_000);
  try {
    await task();
  } finally {
    clearInterval(timer);
  }
}

async function sendThreadChunks(
  thread: {
    send(options: { content: string; allowedMentions: { parse: never[] } }): Promise<unknown>;
  },
  text: string,
): Promise<void> {
  for (const chunk of splitDiscordMessage(text)) {
    await thread.send({ content: chunk, allowedMentions: { parse: [] } });
  }
}

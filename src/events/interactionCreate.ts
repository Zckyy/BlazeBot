import { MessageFlags } from 'discord.js';
import type { Interaction } from 'discord.js';
import type { BotEvent } from '../types/event.js';
import type { BotClient } from '../core/client.js';
import { logger } from '../core/logger.js';
import { interactionHandlers, type ComponentInteraction } from '../interactions/index.js';

export const event: BotEvent<'interactionCreate'> = {
  name: 'interactionCreate',
  async execute(interaction) {
    if (interaction.isChatInputCommand()) {
      const client = interaction.client as BotClient;
      const command = client.commands.get(interaction.commandName);
      if (!command) {
        logger.warn({ command: interaction.commandName }, 'Received unknown command');
        return;
      }
      try {
        await command.execute(interaction);
      } catch (error) {
        logger.error({ err: error, command: interaction.commandName }, 'Command execution failed');
        await sendErrorReply(interaction);
      }
      return;
    }

    if (
      interaction.isButton() ||
      interaction.isStringSelectMenu() ||
      interaction.isModalSubmit()
    ) {
      const prefix = interaction.customId.split(':')[0];
      const handler = interactionHandlers[prefix];
      if (!handler) {
        logger.warn({ customId: interaction.customId }, 'No handler for component interaction');
        return;
      }
      try {
        await handler(interaction as ComponentInteraction);
      } catch (error) {
        logger.error({ err: error, customId: interaction.customId }, 'Interaction handler failed');
        await sendErrorReply(interaction);
      }
    }
  },
};

async function sendErrorReply(
  interaction: Extract<Interaction, { reply: unknown; replied: boolean }>,
): Promise<void> {
  const message = {
    content: 'Something went wrong running that command.',
    flags: MessageFlags.Ephemeral,
  } as const;
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(message);
    } else {
      await interaction.reply(message);
    }
  } catch (replyError) {
    logger.error({ err: replyError }, 'Failed to send error reply');
  }
}

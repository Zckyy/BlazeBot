import { MessageFlags } from 'discord.js';
import type { ComponentInteraction } from '../index.js';

export async function replyEphemeral(
  interaction: ComponentInteraction,
  content: string,
): Promise<void> {
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
  } else {
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
}

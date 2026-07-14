import type {
  ButtonInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';
import { CASINO_PREFIX, handleCasinoInteraction } from './casino.js';

export type ComponentInteraction =
  | ButtonInteraction
  | StringSelectMenuInteraction
  | ModalSubmitInteraction;

type InteractionHandler = (interaction: ComponentInteraction) => Promise<void>;

/** customId prefix (text before the first ':') -> handler. */
export const interactionHandlers: Record<string, InteractionHandler> = {
  [CASINO_PREFIX]: handleCasinoInteraction,
};

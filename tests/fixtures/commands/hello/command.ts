import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../../../src/types/command.js';

export const command: Command = {
  data: new SlashCommandBuilder().setName('hello').setDescription('Test fixture command'),
  async execute() {
    // no-op fixture
  },
};

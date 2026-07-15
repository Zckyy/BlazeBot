import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import type { ComponentInteraction } from '../index.js';
import {
  getConnect4Game,
  saveConnect4Turn,
  type Connect4Game,
  type XpAwardResult,
} from '../../services/database/repositories/workActivities.js';
import {
  availableColumns,
  chooseBotMove,
  hasWinner,
  isBoardFull,
  placePiece,
} from '../../services/work/connect4.js';
import { encodeWorkId } from './ids.js';
import { backToWorkRow } from './hub.js';
import { replyEphemeral } from './view.js';

export function connect4View(game: Connect4Game, award?: XpAwardResult) {
  const symbols = ['⚫', '🔴', '🟡'] as const;
  const board = Array.from({ length: 6 }, (_, row) =>
    game.board
      .slice(row * 7, row * 7 + 7)
      .map((piece) => symbols[piece])
      .join(''),
  ).join('\n');
  const result =
    game.status === 'won'
      ? '🎉 You connected four and won!'
      : game.status === 'lost'
        ? 'BlazeBot connected four. Better luck next time!'
        : game.status === 'draw'
          ? 'It is a draw!'
          : game.status === 'expired'
            ? 'This game expired.'
            : 'You are 🔴. Pick a column.';
  const reward = award
    ? `\nYou earned **${award.xpGained} XP**.${award.leveledUp ? ` 🎉 Level **${award.userLevel.level}**!` : ''}`
    : '';
  const embed = new EmbedBuilder()
    .setTitle('🔴 Connect Four 🟡')
    .setDescription(`${board}\n1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣\n\n${result}${reward}`)
    .setColor(game.status === 'won' ? 0x2ecc71 : game.status === 'lost' ? 0xe74c3c : 0x3498db);

  const available = new Set(availableColumns(game.board));
  const buttons = Array.from({ length: 7 }, (_, column) =>
    new ButtonBuilder()
      .setCustomId(encodeWorkId('connect4-move', game.gameId, String(column)))
      .setLabel(String(column + 1))
      .setStyle(ButtonStyle.Primary)
      .setDisabled(game.status !== 'active' || !available.has(column)),
  );
  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons.slice(0, 4)),
      new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons.slice(4)),
      backToWorkRow(),
    ],
  };
}

export async function handleConnect4Interaction(
  interaction: ComponentInteraction,
  action: string,
  gameId: string,
  argument?: string,
): Promise<void> {
  if (action !== 'connect4-move' || !interaction.isButton() || !interaction.guildId) return;
  const game = getConnect4Game(gameId);
  if (!game || game.guildId !== interaction.guildId || game.userId !== interaction.user.id) {
    await replyEphemeral(
      interaction,
      'This is not your Connect Four game. Start one with `/work connect4`.',
    );
    return;
  }
  if (game.status !== 'active') {
    await interaction.update(connect4View(game));
    return;
  }
  const column = Number(argument);
  let board = placePiece(game.board, column, 1);
  if (!board) {
    await replyEphemeral(interaction, 'That column is full. Pick another one.');
    return;
  }

  let status: 'active' | 'won' | 'lost' | 'draw' = 'active';
  if (hasWinner(board, 1)) status = 'won';
  else if (isBoardFull(board)) status = 'draw';
  else {
    const botColumn = chooseBotMove(board);
    if (botColumn !== undefined) board = placePiece(board, botColumn, 2)!;
    if (hasWinner(board, 2)) status = 'lost';
    else if (isBoardFull(board)) status = 'draw';
  }

  const saved = saveConnect4Turn(game.gameId, game.guildId, game.userId, game.board, board, status);
  if (saved.status === 'expired') {
    const expiredGame = getConnect4Game(game.gameId);
    if (expiredGame) await interaction.update(connect4View(expiredGame));
    else
      await replyEphemeral(
        interaction,
        '⌛ This game expired. Start another with `/work connect4`.',
      );
    return;
  }
  if (saved.status !== 'saved') {
    await replyEphemeral(
      interaction,
      'That game changed before this move was processed. Please use the latest board.',
    );
    return;
  }
  await interaction.update(connect4View(saved.game, saved.award));
}

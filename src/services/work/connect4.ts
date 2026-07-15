export const CONNECT4_ROWS = 6;
export const CONNECT4_COLUMNS = 7;
export type Connect4Piece = 0 | 1 | 2;
export type Connect4Board = Connect4Piece[];

export function emptyBoard(): Connect4Board {
  return Array<Connect4Piece>(CONNECT4_ROWS * CONNECT4_COLUMNS).fill(0);
}

export function serializeBoard(board: Connect4Board): string {
  validateBoard(board);
  return board.join('');
}

export function parseBoard(serialized: string): Connect4Board {
  if (serialized.length !== CONNECT4_ROWS * CONNECT4_COLUMNS || !/^[012]+$/.test(serialized)) {
    throw new Error('Invalid Connect Four board');
  }
  return [...serialized].map((value) => Number(value) as Connect4Piece);
}

export function availableColumns(board: Connect4Board): number[] {
  validateBoard(board);
  return Array.from({ length: CONNECT4_COLUMNS }, (_, column) => column).filter(
    (column) => board[column] === 0,
  );
}

export function placePiece(
  board: Connect4Board,
  column: number,
  piece: Exclude<Connect4Piece, 0>,
): Connect4Board | undefined {
  validateBoard(board);
  if (!Number.isInteger(column) || column < 0 || column >= CONNECT4_COLUMNS) return undefined;
  const next = [...board];
  for (let row = CONNECT4_ROWS - 1; row >= 0; row -= 1) {
    const index = row * CONNECT4_COLUMNS + column;
    if (next[index] === 0) {
      next[index] = piece;
      return next;
    }
  }
  return undefined;
}

export function hasWinner(board: Connect4Board, piece: Exclude<Connect4Piece, 0>): boolean {
  validateBoard(board);
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ] as const;
  for (let row = 0; row < CONNECT4_ROWS; row += 1) {
    for (let column = 0; column < CONNECT4_COLUMNS; column += 1) {
      for (const [rowStep, columnStep] of directions) {
        let matches = true;
        for (let offset = 0; offset < 4; offset += 1) {
          const checkRow = row + rowStep * offset;
          const checkColumn = column + columnStep * offset;
          if (
            checkRow < 0 ||
            checkRow >= CONNECT4_ROWS ||
            checkColumn < 0 ||
            checkColumn >= CONNECT4_COLUMNS ||
            board[checkRow * CONNECT4_COLUMNS + checkColumn] !== piece
          ) {
            matches = false;
            break;
          }
        }
        if (matches) return true;
      }
    }
  }
  return false;
}

export function isBoardFull(board: Connect4Board): boolean {
  return availableColumns(board).length === 0;
}

export function chooseBotMove(board: Connect4Board, random = Math.random): number | undefined {
  const available = availableColumns(board);
  for (const column of available) {
    const next = placePiece(board, column, 2)!;
    if (hasWinner(next, 2)) return column;
  }
  for (const column of available) {
    const next = placePiece(board, column, 1)!;
    if (hasWinner(next, 1)) return column;
  }
  if (available.length === 0) return undefined;
  const bestDistance = Math.min(...available.map((column) => Math.abs(column - 3)));
  const preferred = available.filter((column) => Math.abs(column - 3) === bestDistance);
  return preferred[Math.min(Math.floor(random() * preferred.length), preferred.length - 1)];
}

function validateBoard(board: Connect4Board): void {
  if (
    board.length !== CONNECT4_ROWS * CONNECT4_COLUMNS ||
    board.some((piece) => piece !== 0 && piece !== 1 && piece !== 2)
  ) {
    throw new Error('Invalid Connect Four board');
  }
}

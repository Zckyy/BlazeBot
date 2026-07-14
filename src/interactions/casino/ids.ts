// ---------------------------------------------------------------------------
// customId codec — all flow state travels inside the customId (stateless).
// Format: casino:<userId>:<action>[:<arg>...]
// ---------------------------------------------------------------------------

export const CASINO_PREFIX = 'casino';

export interface CasinoId {
  userId: string;
  action: string;
  args: string[];
}

export function encodeCasinoId(userId: string, action: string, ...args: string[]): string {
  return [CASINO_PREFIX, userId, action, ...args].join(':');
}

export function decodeCasinoId(customId: string): CasinoId | undefined {
  const parts = customId.split(':');
  if (parts.length < 3 || parts[0] !== CASINO_PREFIX) return undefined;
  const [, userId, action, ...args] = parts;
  if (!userId || !action) return undefined;
  return { userId, action, args };
}

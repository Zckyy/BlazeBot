export const WORK_PREFIX = 'work';

export interface WorkId {
  action: string;
  sessionId: string;
  argument?: string;
}

export function encodeWorkId(action: string, sessionId: string, argument?: string): string {
  return [WORK_PREFIX, action, sessionId, argument].filter(Boolean).join(':');
}

export function decodeWorkId(customId: string): WorkId | undefined {
  const [prefix, action, sessionId, argument, ...extra] = customId.split(':');
  if (prefix !== WORK_PREFIX || !action || !sessionId || extra.length > 0) return undefined;
  return { action, sessionId, argument };
}

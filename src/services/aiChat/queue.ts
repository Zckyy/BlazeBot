const pendingByConversation = new Map<number, number>();
const tails = new Map<number, Promise<void>>();

export class ConversationQueueFullError extends Error {
  constructor() {
    super('This conversation already has too many messages waiting.');
    this.name = 'ConversationQueueFullError';
  }
}

export async function enqueueConversation<T>(
  conversationId: number,
  task: () => Promise<T>,
): Promise<T> {
  const pending = pendingByConversation.get(conversationId) ?? 0;
  if (pending >= 3) throw new ConversationQueueFullError();
  pendingByConversation.set(conversationId, pending + 1);

  const previous = tails.get(conversationId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  tails.set(
    conversationId,
    previous.then(() => current),
  );

  await previous;
  try {
    return await task();
  } finally {
    release();
    const remaining = (pendingByConversation.get(conversationId) ?? 1) - 1;
    if (remaining <= 0) {
      pendingByConversation.delete(conversationId);
      tails.delete(conversationId);
    } else {
      pendingByConversation.set(conversationId, remaining);
    }
  }
}

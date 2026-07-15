import { getDb } from '../db.js';

export interface AiConversation {
  id: number;
  guildId: string;
  parentChannelId: string;
  threadId: string;
  ownerUserId: string;
  model: string;
  reasoningEffort: 'none' | 'low';
  promptVersion: number;
  contextSegment: number;
  status: 'active' | 'ended';
  createdAt: string;
  lastActiveAt: string;
}

export interface AiContextMessage {
  role: 'user' | 'assistant';
  content: string;
  authorUserId: string | null;
}

export interface AiUsageRecord {
  conversationId?: number;
  guildId: string;
  userId: string;
  providerResponseId: string;
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
  outputTokens: number;
  serverSideToolCalls: number;
  latencyMs: number;
  estimatedCostUsd: number;
}

interface ConversationRow {
  id: number;
  guild_id: string;
  parent_channel_id: string;
  thread_id: string;
  owner_user_id: string;
  model: string;
  reasoning_effort: 'none' | 'low';
  prompt_version: number;
  context_segment: number;
  status: 'active' | 'ended';
  created_at: string;
  last_active_at: string;
}

export function createAiConversation(input: {
  guildId: string;
  parentChannelId: string;
  threadId: string;
  ownerUserId: string;
  model: string;
  reasoningEffort: 'none' | 'low';
}): AiConversation {
  const result = getDb()
    .prepare(
      `INSERT INTO ai_conversations
         (guild_id, parent_channel_id, thread_id, owner_user_id, model, reasoning_effort)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.guildId,
      input.parentChannelId,
      input.threadId,
      input.ownerUserId,
      input.model,
      input.reasoningEffort,
    );
  return getAiConversationById(Number(result.lastInsertRowid))!;
}

export function getAiConversationById(id: number): AiConversation | undefined {
  const row = getDb().prepare('SELECT * FROM ai_conversations WHERE id = ?').get(id) as
    ConversationRow | undefined;
  return row ? mapConversation(row) : undefined;
}

export function getActiveAiConversationByThreadId(threadId: string): AiConversation | undefined {
  const row = getDb()
    .prepare("SELECT * FROM ai_conversations WHERE thread_id = ? AND status = 'active'")
    .get(threadId) as ConversationRow | undefined;
  return row ? mapConversation(row) : undefined;
}

export function countActiveAiConversationsForOwner(guildId: string, ownerUserId: string): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS count FROM ai_conversations
       WHERE guild_id = ? AND owner_user_id = ? AND status = 'active'`,
    )
    .get(guildId, ownerUserId) as { count: number };
  return row.count;
}

export function beginAiUserMessage(input: {
  conversationId: number;
  discordMessageId: string;
  authorUserId: string;
  content: string;
  contextSegment: number;
}): boolean {
  const result = getDb()
    .prepare(
      `INSERT OR IGNORE INTO ai_messages
         (conversation_id, discord_message_id, role, author_user_id, content, context_segment, status)
       VALUES (?, ?, 'user', ?, ?, ?, 'pending')`,
    )
    .run(
      input.conversationId,
      input.discordMessageId,
      input.authorUserId,
      input.content,
      input.contextSegment,
    );
  return result.changes === 1;
}

export function completeAiTurn(input: {
  conversationId: number;
  discordMessageId: string;
  assistantContent: string;
  contextSegment: number;
}): void {
  getDb().transaction(() => {
    getDb()
      .prepare(
        `UPDATE ai_messages SET status = 'completed'
         WHERE conversation_id = ? AND discord_message_id = ? AND status = 'pending'`,
      )
      .run(input.conversationId, input.discordMessageId);
    getDb()
      .prepare(
        `INSERT INTO ai_messages
           (conversation_id, role, content, context_segment, status)
         VALUES (?, 'assistant', ?, ?, 'completed')`,
      )
      .run(input.conversationId, input.assistantContent, input.contextSegment);
    getDb()
      .prepare(
        `UPDATE ai_conversations
         SET updated_at = datetime('now'), last_active_at = datetime('now') WHERE id = ?`,
      )
      .run(input.conversationId);
  })();
}

export function failAiUserMessage(conversationId: number, discordMessageId: string): void {
  getDb()
    .prepare(
      `UPDATE ai_messages SET status = 'failed'
       WHERE conversation_id = ? AND discord_message_id = ? AND status = 'pending'`,
    )
    .run(conversationId, discordMessageId);
}

export function getAiContextMessages(
  conversationId: number,
  contextSegment: number,
  characterBudget: number,
): AiContextMessage[] {
  const rows = getDb()
    .prepare(
      `SELECT role, content, author_user_id
       FROM ai_messages
       WHERE conversation_id = ? AND context_segment = ? AND status = 'completed'
       ORDER BY id DESC LIMIT 100`,
    )
    .all(conversationId, contextSegment) as {
    role: 'user' | 'assistant';
    content: string;
    author_user_id: string | null;
  }[];

  const selected: AiContextMessage[] = [];
  let used = 0;
  for (const row of rows) {
    const size = row.content.length + 32;
    if (selected.length > 0 && used + size > characterBudget) break;
    selected.push({ role: row.role, content: row.content, authorUserId: row.author_user_id });
    used += size;
  }
  return selected.reverse();
}

export function resetAiConversation(id: number): AiConversation | undefined {
  getDb()
    .prepare(
      `UPDATE ai_conversations SET context_segment = context_segment + 1,
       updated_at = datetime('now'), last_active_at = datetime('now')
       WHERE id = ? AND status = 'active'`,
    )
    .run(id);
  return getAiConversationById(id);
}

export function endAiConversation(id: number): void {
  getDb()
    .prepare(
      `UPDATE ai_conversations SET status = 'ended', updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(id);
}

export function countCompletedAiMessages(id: number, contextSegment: number): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS count FROM ai_messages
       WHERE conversation_id = ? AND context_segment = ? AND status = 'completed'`,
    )
    .get(id, contextSegment) as { count: number };
  return row.count;
}

export function recordAiUsage(usage: AiUsageRecord): void {
  getDb()
    .prepare(
      `INSERT INTO ai_usage
         (conversation_id, guild_id, user_id, provider_response_id, model, input_tokens,
          cached_input_tokens, reasoning_tokens, output_tokens, server_side_tool_calls, latency_ms,
          estimated_cost_usd)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      usage.conversationId ?? null,
      usage.guildId,
      usage.userId,
      usage.providerResponseId,
      usage.model,
      usage.inputTokens,
      usage.cachedInputTokens,
      usage.reasoningTokens,
      usage.outputTokens,
      usage.serverSideToolCalls,
      usage.latencyMs,
      usage.estimatedCostUsd,
    );
}

export function getGuildAiSpendToday(guildId: string): number {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(estimated_cost_usd), 0) AS total FROM ai_usage
       WHERE guild_id = ? AND date(created_at) = date('now')`,
    )
    .get(guildId) as { total: number };
  return row.total;
}

function mapConversation(row: ConversationRow): AiConversation {
  return {
    id: row.id,
    guildId: row.guild_id,
    parentChannelId: row.parent_channel_id,
    threadId: row.thread_id,
    ownerUserId: row.owner_user_id,
    model: row.model,
    reasoningEffort: row.reasoning_effort,
    promptVersion: row.prompt_version,
    contextSegment: row.context_segment,
    status: row.status,
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
  };
}

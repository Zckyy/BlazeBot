ALTER TABLE ai_conversations ADD COLUMN provider TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE ai_usage ADD COLUMN provider TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE ai_usage ADD COLUMN exact_cost_usd REAL;

UPDATE ai_conversations
SET provider = 'openrouter',
    model = 'deepseek/deepseek-v4-flash',
    reasoning_effort = 'none',
    updated_at = datetime('now')
WHERE status = 'active';

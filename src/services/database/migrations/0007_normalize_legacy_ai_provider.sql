UPDATE ai_conversations
SET provider = 'legacy'
WHERE provider <> 'openrouter';

UPDATE ai_usage
SET provider = 'legacy'
WHERE provider <> 'openrouter';

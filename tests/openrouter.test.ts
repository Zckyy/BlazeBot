import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { suppressDiscordLinkEmbeds } from '../src/services/openrouter/client.js';

describe('OpenRouter response formatting', () => {
  it('suppresses embeds for bare links', () => {
    assert.equal(
      suppressDiscordLinkEmbeds('Visit https://example.com/docs, then reply.'),
      'Visit <https://example.com/docs>, then reply.',
    );
  });

  it('suppresses embeds for Markdown links while retaining their labels', () => {
    assert.equal(
      suppressDiscordLinkEmbeds('Read [the documentation](https://example.com/docs).'),
      'Read the documentation (<https://example.com/docs>).',
    );
  });

  it('leaves already-suppressed links unchanged', () => {
    assert.equal(
      suppressDiscordLinkEmbeds('Visit <https://example.com/docs>.'),
      'Visit <https://example.com/docs>.',
    );
  });
});

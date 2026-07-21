import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadHost } from '../helpers/loadHost.mjs';

const { mergeSessionMessagesById, collapseMessagesForDisplay, textScore } = loadHost('merge');

describe('merge + collapse', () => {
  it('prefers MIMO_PART over plain text', () => {
    assert.ok(textScore('%%MIMO_PART:tool|x||closed|%%\n') > textScore('plain answer'));
    const merged = mergeSessionMessagesById(
      [
        {
          id: 'a1',
          role: 'assistant',
          text: '%%MIMO_PART:tool|bash|x|closed|%%\nIN:\nx\n%%/MIMO_PART%%',
        },
      ],
      [{ id: 'a1', role: 'assistant', text: 'plain only' }]
    );
    assert.ok(merged[0].text.includes('%%MIMO_PART'));
  });

  it('keeps all assistants (not last-only)', () => {
    const out = collapseMessagesForDisplay([
      { id: 'u1', role: 'user', text: 'hi' },
      {
        id: 'a1',
        role: 'assistant',
        text: '%%MIMO_PART:tool|bash|x|closed|%%\n%%/MIMO_PART%%',
      },
      {
        id: 'a2',
        role: 'assistant',
        text: '%%MIMO_PART:patch|edit|f|open|%%\n%%/MIMO_PART%%',
      },
      { id: 'a3', role: 'assistant', text: 'final' },
    ]);
    assert.equal(out.filter((m) => m.role === 'assistant').length, 3);
  });
});

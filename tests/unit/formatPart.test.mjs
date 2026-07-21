import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadHost } from '../helpers/loadHost.mjs';

const {
  formatPartForDisplay,
  formatDbMessages,
  countToolMessages,
  splitMimoParts,
} = loadHost('format');

describe('formatPartForDisplay', () => {
  it('formats bash tool with IN/OUT', () => {
    const text = formatPartForDisplay({
      type: 'tool',
      tool: 'bash',
      cmd: 'echo hello',
      result: 'hello',
    });
    assert.ok(text.includes('%%MIMO_PART:tool|bash|'));
    assert.ok(text.includes('IN:\necho hello'));
    assert.ok(text.includes('OUT:\nhello'));
  });

  it('formats edit as patch with mini-diff', () => {
    const text = formatPartForDisplay({
      type: 'tool',
      tool: 'edit',
      path: 'src/a.ts',
      old_string: 'a',
      new_string: 'b',
    });
    const card = splitMimoParts(text).find((s) => s.kind === 'patch');
    assert.ok(card);
    assert.equal(card.title, 'edit');
    assert.ok(card.body.includes('-a'));
    assert.ok(card.body.includes('+b'));
  });

  it('formats thinking closed', () => {
    const text = formatPartForDisplay({
      type: 'reasoning',
      text: 'hmm',
    });
    const card = splitMimoParts(text).find((s) => s.kind === 'thinking');
    assert.ok(card);
    assert.equal(card.open, false);
    assert.equal(card.body.trim(), 'hmm');
  });

  it('formatDbMessages groups tools', () => {
    const msgs = formatDbMessages([
      {
        id: 'msg_1',
        role: 'assistant',
        parts: [
          { type: 'tool', tool: 'bash', cmd: 'ls', result: 'ok' },
          { type: 'text', text: 'done' },
        ],
      },
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
    ]);
    assert.equal(msgs.length, 2);
    assert.equal(countToolMessages(msgs), 1);
  });
});

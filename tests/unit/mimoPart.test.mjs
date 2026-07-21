import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadHost } from '../helpers/loadHost.mjs';

const { wrapMimoPart, splitMimoParts, sanitizeHeaderField, countMimoCards } = loadHost('format');

describe('mimoPart protocol', () => {
  it('sanitizes | and % in header fields', () => {
    assert.equal(sanitizeHeaderField('a|b%c'), 'a/bpctc');
  });

  it('wrap + split roundtrip for tool card', () => {
    const s = wrapMimoPart('tool', 'bash', 'echo hi', 'IN:\necho hi\nOUT:\nok', false, '1s');
    assert.ok(s.includes('%%MIMO_PART:tool|bash|'));
    assert.ok(s.includes('%%/MIMO_PART%%'));
    const segs = splitMimoParts(s);
    const cards = segs.filter((x) => x.kind !== 'text');
    assert.equal(cards.length, 1);
    assert.equal(cards[0].kind, 'tool');
    assert.equal(cards[0].title, 'bash');
    assert.ok(cards[0].body.includes('IN:'));
    assert.ok(cards[0].body.includes('OUT:'));
  });

  it('escapes poison close marker in body', () => {
    const s = wrapMimoPart('tool', 'x', '', 'before %%/MIMO_PART%% after');
    assert.ok(s.includes('%%/MIMO_PART_ESC%%'));
    const segs = splitMimoParts(s);
    const card = segs.find((x) => x.kind === 'tool');
    assert.ok(card.body.includes('%%/MIMO_PART%%'));
  });

  it('meta with percent becomes pct so old regex would fail but new split works', () => {
    const s = wrapMimoPart('tool', 'bash', '50% done', 'OUT:\nok');
    assert.equal(countMimoCards(s), 1);
  });

  it('edit open when open flag set', () => {
    const s = wrapMimoPart('patch', 'edit', 'f.ts', 'IN:\nf.ts\nOUT:\n+line', true);
    const card = splitMimoParts(s).find((x) => x.kind === 'patch');
    assert.equal(card.open, true);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadHost } from '../helpers/loadHost.mjs';

const { isJunkSessionTitle, pickHomeRecent } = loadHost('db');

describe('session list junk filter', () => {
  it('drops checkpoint-writer and stubs', () => {
    assert.equal(
      isJunkSessionTitle('checkpoint-writer: Previous checkpoint: C:\\Users\\x'),
      true
    );
    assert.equal(isJunkSessionTitle('Previous checkpoint: foo'), true);
    assert.equal(isJunkSessionTitle('Untitled Session'), true);
    assert.equal(isJunkSessionTitle('New session'), true);
    assert.equal(isJunkSessionTitle('ses_abc123'), true);
  });

  it('keeps real user titles', () => {
    assert.equal(isJunkSessionTitle('VS Code extension with Mimo Code'), false);
    assert.equal(isJunkSessionTitle('Приветствие (fork #1)'), false);
    assert.equal(isJunkSessionTitle('Делегирование работы другой сессии'), false);
  });

  it('pickHomeRecent never returns junk', () => {
    const out = pickHomeRecent(
      [
        {
          id: 'a',
          title: 'checkpoint-writer: Previous checkpoint: x',
          updated: '',
        },
        { id: 'b', title: 'Real chat', updated: '' },
        { id: 'c', title: 'Untitled', updated: '' },
        { id: 'd', title: 'Previous checkpoint: y', updated: '' },
      ],
      6
    );
    assert.deepEqual(
      out.map((s) => s.id),
      ['b']
    );
  });
});

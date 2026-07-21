import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadHost } from '../helpers/loadHost.mjs';

const {
  querySessionFromDb,
  listSessionsFromSqlite,
  pickHomeRecent,
  dbAvailable,
} = loadHost('db');
const { formatDbMessages, countToolMessages, countMimoCards } = loadHost('format');

describe('e2e real mimocode.db', () => {
  it('db available on this machine', () => {
    assert.equal(typeof dbAvailable, 'function');
    if (!dbAvailable()) {
      console.log('SKIP: no mimocode.db / sqlite3');
      return;
    }
    assert.ok(dbAvailable());
  });

  it('lists sessions quickly and caps home recent', () => {
    if (!dbAvailable()) return;
    const t0 = Date.now();
    const list = listSessionsFromSqlite(12);
    const ms = Date.now() - t0;
    assert.ok(list.length > 0, 'expected sessions');
    assert.ok(ms < 5000, `list too slow: ${ms}ms`);
    const home = pickHomeRecent(list, 6);
    assert.ok(home.length <= 6);
  });

  it('formats real session with tool cards', () => {
    if (!dbAvailable()) return;
    const preferred = 'ses_098064554ffe8Hzod9Y2u4E4Ya';
    const list = listSessionsFromSqlite(20);
    const sid =
      list.find((s) => s.id === preferred)?.id ||
      list.find((s) => /extension|Github|Grok/i.test(s.title))?.id ||
      list[0]?.id;
    assert.ok(sid, 'need a session id');

    const t0 = Date.now();
    const data = querySessionFromDb(sid, 24);
    const qMs = Date.now() - t0;
    const formatted = formatDbMessages(data.messages);
    const toolMsgs = countToolMessages(formatted);
    let cards = 0;
    for (const m of formatted) cards += countMimoCards(m.text);

    console.log(
      JSON.stringify(
        {
          sid,
          qMs,
          dbMetaMs: data.meta.ms,
          msgs: formatted.length,
          toolMsgs,
          cards,
          older: data.meta.olderCount,
          total: data.meta.totalMessages,
        },
        null,
        2
      )
    );

    assert.ok(formatted.length > 0, 'formatted empty');
    assert.ok(qMs < 15000, `query+format too slow ${qMs}`);
    if (toolMsgs === 0) {
      const alt = 'ses_0926fd416ffeyXG0Mc5SdUf7G4';
      const d2 = querySessionFromDb(alt, 40);
      const f2 = formatDbMessages(d2.messages);
      const t2 = countToolMessages(f2);
      let c2 = 0;
      for (const m of f2) c2 += countMimoCards(m.text);
      console.log({ alt, toolMsgs: t2, cards: c2, ms: d2.meta.ms });
      assert.ok(t2 > 0 && c2 > 0, 'expected tools on known session');
    } else {
      assert.ok(cards > 0);
    }
  });
});

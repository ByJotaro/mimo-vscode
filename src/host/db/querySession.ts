import * as fs from 'fs';
import { runSqliteJson, runSqliteTsv } from './sqlite';
import { findSqlite3Bin, getMimoDbPath } from './paths';

export type SessionQueryResult = {
  session: { id: string; title: string };
  messages: Array<{ id: string; role: string; parts: any[] }>;
  meta: {
    totalMessages: number;
    olderCount: number;
    loaded: number;
    limit: number;
    ms: number;
  };
};

export function querySessionFromDb(sessionId: string, limit = 24): SessionQueryResult {
  const t0 = Date.now();
  const safeLimit = Math.max(1, Math.floor(Number.isFinite(limit) ? limit : 24));
  const esc = (s: string) => s.replace(/'/g, "''");
  const sid = esc(sessionId);

  const sql =
    "SELECT p.message_id as mid, json_extract(m.data,'$.role') as role, " +
    "json_extract(p.data,'$.type') as type, " +
    "substr(COALESCE(json_extract(p.data,'$.text'),''),1,12000) as text, " +
    "json_extract(p.data,'$.tool') as tool, " +
    "substr(COALESCE(json_extract(p.data,'$.state.input.command'),''),1,6000) as cmd, " +
    "json_extract(p.data,'$.state.input.file_path') as path, " +
    "substr(COALESCE(json_extract(p.data,'$.state.input.old_string'),''),1,8000) as old_string, " +
    "substr(COALESCE(json_extract(p.data,'$.state.input.new_string'),''),1,8000) as new_string, " +
    "substr(COALESCE(json_extract(p.data,'$.state.input.content'),''),1,8000) as content, " +
    "substr(COALESCE(json_extract(p.data,'$.state.metadata.diff'),''),1,12000) as meta_diff, " +
    "substr(COALESCE(json_extract(p.data,'$.state.metadata.filediff.patch'),''),1,12000) as meta_patch, " +
    "substr(COALESCE(json_extract(p.data,'$.state.output'),''),1,8000) as result, " +
    "json_extract(p.data,'$.callID') as callID, " +
    "json_extract(p.data,'$.hash') as hash, " +
    "json_extract(p.data,'$.files') as files, " +
    "p.time_created as time " +
    'FROM part p JOIN (' +
    `  SELECT id as message_id FROM message WHERE session_id = '${sid}' ` +
    `  ORDER BY time_created DESC LIMIT ${safeLimit}` +
    ') sm ON p.message_id = sm.message_id ' +
    'JOIN message m ON m.id = p.message_id ' +
    `WHERE p.session_id = '${sid}' ` +
    'ORDER BY m.time_created ASC, p.time_created ASC;';

  const arr = runSqliteJson(sql) || [];
  const byMsg = new Map<string, any>();
  const order: string[] = [];
  for (const row of arr) {
    if (!row || !row.mid) continue;
    if (!byMsg.has(row.mid)) {
      byMsg.set(row.mid, { id: row.mid, role: row.role, parts: [] });
      order.push(row.mid);
    }
    if (typeof row.files === 'string' && row.files.startsWith('[')) {
      try {
        row.files = JSON.parse(row.files);
      } catch {
        /* keep */
      }
    }
    byMsg.get(row.mid)!.parts.push(row);
  }
  const messages = order.map((id) => byMsg.get(id));

  let title = sessionId;
  let totalMessages = messages.length;
  const meta = runSqliteJson(
    `SELECT title, (SELECT count(*) FROM message WHERE session_id = '${sid}') as total ` +
      `FROM session WHERE id = '${sid}' LIMIT 1;`
  );
  if (Array.isArray(meta) && meta[0]) {
    if (meta[0].title) title = String(meta[0].title);
    const t = meta[0].total;
    if (typeof t === 'number') totalMessages = t;
    else if (typeof t === 'string') totalMessages = parseInt(t, 10) || totalMessages;
  }

  const olderCount = Math.max(0, totalMessages - messages.length);
  return {
    session: { id: sessionId, title },
    messages,
    meta: {
      totalMessages,
      olderCount,
      loaded: messages.length,
      limit: safeLimit,
      ms: Date.now() - t0,
    },
  };
}

export type SessionListItem = {
  id: string;
  title: string;
  updated: string;
};

/**
 * Internal/agent sessions that must never appear in Home or History.
 * checkpoint-writer floods the DB as titled forks of real chats.
 */
export function isJunkSessionTitle(title: string): boolean {
  const t = String(title || '').trim();
  if (!t || t.length < 2) return true;
  if (/^untitled(\s+session)?$/i.test(t)) return true;
  if (/^new session(\s|$|-)/i.test(t)) return true;
  // Greeting / one-shot stub titles (not real projects)
  if (/one[- ]?word greeting/i.test(t)) return true;
  if (/^(quick\s+)?(one[- ]?word\s+)?greeting/i.test(t)) return true;
  if (/single[- ]word greeting/i.test(t)) return true;
  if (/^приветствие(\s+пользователя)?$/i.test(t)) return true;
  if (/^(quick\s+)?math question/i.test(t)) return true;
  if (/^2\s*\+\s*2/i.test(t)) return true;
  // Agent internals / checkpoint fleet
  if (/checkpoint[- ]?writer/i.test(t)) return true;
  if (/previous checkpoint/i.test(t)) return true;
  if (/^summary(\s|$|:)/i.test(t)) return true;
  if (/^title(\s|$|:)/i.test(t)) return true;
  if (/^compaction(\s|$|:)/i.test(t)) return true;
  if (/^explore-\d+/i.test(t)) return true;
  if (/^general-\d+/i.test(t)) return true;
  if (/^read-only final review/i.test(t)) return true;
  if (/^работай автономно/i.test(t)) return true;
  if (/^продолжи предыдущую работу/i.test(t)) return true;
  // Bare session ids as titles
  if (/^ses_[a-zA-Z0-9]+$/i.test(t)) return true;
  return false;
}

export function listSessionsFromSqlite(
  limit = 12,
  opts?: { includeForks?: boolean }
): SessionListItem[] {
  // Over-fetch then filter — junk (checkpoint-writer) often fills LIMIT first
  const want = Math.max(1, Math.min(80, Math.floor(limit)));
  const fetchN = Math.min(400, Math.max(want * 8, 40));
  // User-facing lists = root sessions only (forks are agent/checkpoint noise)
  const where = opts?.includeForks
    ? `WHERE 1=1 `
    : `WHERE (parent_id IS NULL OR parent_id = '') `;
  // SQL pre-filter for the worst offenders
  const sql =
    `SELECT id, COALESCE(title,''), COALESCE(time_updated,0), COALESCE(time_created,0) ` +
    `FROM session ${where}` +
    `AND COALESCE(title,'') NOT LIKE '%checkpoint-writer%' ` +
    `AND COALESCE(title,'') NOT LIKE '%Previous checkpoint%' ` +
    `AND COALESCE(title,'') NOT LIKE 'Untitled%' ` +
    `AND COALESCE(title,'') NOT LIKE 'New session%' ` +
    `AND COALESCE(title,'') NOT LIKE '%one-word greeting%' ` +
    `AND COALESCE(title,'') NOT LIKE '%Math question%' ` +
    `AND COALESCE(title,'') NOT LIKE 'Приветствие' ` +
    `AND COALESCE(title,'') NOT LIKE 'Приветствие пользователя' ` +
    `ORDER BY COALESCE(time_updated, time_created, 0) DESC LIMIT ${fetchN};`;
  const out = runSqliteTsv(sql);
  const lines = String(out || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const result: SessionListItem[] = [];
  for (const line of lines) {
    const cols = line.split('\t');
    if (!cols[0]) continue;
    const id = cols[0];
    if (id === '_loading') continue;
    const title = cols[1] || '';
    if (isJunkSessionTitle(title)) continue;
    const updatedMs = Number(cols[2] || cols[3] || 0) || 0;
    result.push({
      id,
      title: title || id,
      updated: updatedMs
        ? new Date(updatedMs < 1e12 ? updatedMs * 1000 : updatedMs).toLocaleString()
        : '',
    });
    if (result.length >= want) break;
  }
  return result;
}

/** Home Recent / History: real user sessions only. */
export function pickHomeRecent(sessions: SessionListItem[], cap = 6): SessionListItem[] {
  const real = sessions.filter((s) => {
    if (!s?.id || s.id === '_loading') return false;
    return !isJunkSessionTitle(s.title);
  });
  // Never fall back to junk — empty is better than checkpoint-writer spam
  return real.slice(0, Math.max(1, Math.min(80, cap)));
}

export function dbAvailable(): boolean {
  const p = getMimoDbPath();
  return Boolean(p && fs.existsSync(p) && findSqlite3Bin());
}

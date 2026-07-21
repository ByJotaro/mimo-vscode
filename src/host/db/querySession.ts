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

const JUNK_TITLE = /^(One-word greeting|New session\s*-|Untitled)/i;

export function listSessionsFromSqlite(limit = 12): SessionListItem[] {
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  const sql =
    `SELECT id, COALESCE(title,''), COALESCE(time_updated,0), COALESCE(time_created,0) ` +
    `FROM session WHERE (parent_id IS NULL OR parent_id = '') ` +
    `ORDER BY COALESCE(time_updated, time_created, 0) DESC LIMIT ${safeLimit};`;
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
    const title = cols[1] || 'Untitled Session';
    const updatedMs = Number(cols[2] || cols[3] || 0) || 0;
    result.push({
      id,
      title,
      updated: updatedMs
        ? new Date(updatedMs < 1e12 ? updatedMs * 1000 : updatedMs).toLocaleString()
        : '',
    });
  }
  return result;
}

/** Home Recent: few real sessions, drop stubs. */
export function pickHomeRecent(sessions: SessionListItem[], cap = 6): SessionListItem[] {
  const real = sessions.filter((s) => {
    const t = String(s.title || '').trim();
    if (!t || t.length < 2) return false;
    if (JUNK_TITLE.test(t)) return false;
    return Boolean(s.id);
  });
  const base = real.length ? real : sessions.filter((s) => s.id);
  return base.slice(0, Math.max(1, Math.min(40, cap)));
}

export function dbAvailable(): boolean {
  const p = getMimoDbPath();
  return Boolean(p && fs.existsSync(p) && findSqlite3Bin());
}

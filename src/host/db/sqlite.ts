import * as cp from 'child_process';
import * as fs from 'fs';
import { findSqlite3Bin, getMimoDbPath } from './paths';

export function runSqliteJson(sql: string, dbPath?: string): any[] | null {
  const db = dbPath || getMimoDbPath();
  const bin = findSqlite3Bin();
  if (!db || !bin || !fs.existsSync(db)) return null;
  try {
    const out = cp.execFileSync(bin, ['-json', db, sql], {
      encoding: 'utf8',
      maxBuffer: 80 * 1024 * 1024,
      windowsHide: true,
      timeout: 30000,
    });
    const text = String(out || '').trim();
    if (!text) return [];
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return null;
  }
}

export function runSqliteTsv(sql: string, dbPath?: string): string {
  const db = dbPath || getMimoDbPath();
  const bin = findSqlite3Bin();
  if (!db || !bin || !fs.existsSync(db)) return '';
  try {
    return cp.execFileSync(bin, ['-separator', '\t', db, sql], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
      timeout: 10000,
    });
  } catch {
    return '';
  }
}

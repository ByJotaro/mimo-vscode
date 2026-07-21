import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';

export function getMimoDbPath(): string {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const candidates = [
    path.join(home, '.local', 'share', 'mimocode', 'mimocode.db'),
    path.join(home, 'AppData', 'Roaming', 'mimocode', 'mimocode.db'),
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* next */
    }
  }
  return candidates[0] || '';
}

export function findSqlite3Bin(): string | null {
  const candidates = [
    'C:\\Program Files\\platform-tools\\sqlite3.exe',
    'C:\\msys64\\ucrt64\\bin\\sqlite3.exe',
    'sqlite3',
    'sqlite3.exe',
  ];
  for (const c of candidates) {
    try {
      if (c.includes('\\') || c.includes('/')) {
        if (fs.existsSync(c)) return c;
      } else {
        cp.execFileSync(c, ['-version'], {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 2000,
        });
        return c;
      }
    } catch {
      /* next */
    }
  }
  return null;
}

export function getMimoBin(): string {
  const envBin = process.env.MIMO_BIN;
  if (envBin) return envBin;
  const home = process.env.USERPROFILE || process.env.HOME || '';
  if (process.platform === 'win32') {
    const candidates = [
      path.join(
        home,
        'AppData',
        'Roaming',
        'npm',
        'node_modules',
        '@mimo-ai',
        'cli',
        'node_modules',
        '@mimo-ai',
        'mimocode-windows-x64',
        'bin',
        'mimo.exe'
      ),
      path.join(
        home,
        'AppData',
        'Roaming',
        'npm',
        'node_modules',
        '@mimo-ai',
        'mimocode-windows-x64',
        'bin',
        'mimo.exe'
      ),
    ];
    for (const c of candidates) {
      try {
        if (fs.existsSync(c)) return c;
      } catch {
        /* next */
      }
    }
  }
  return 'mimo';
}

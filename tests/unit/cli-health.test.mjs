/**
 * Smoke: can spawn mimo serve, hit /global/health, kill only our PID.
 * Skips if mimo.exe missing.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'child_process';
import http from 'http';
import path from 'path';
import fs from 'fs';
import os from 'os';

function findMimo() {
  const home = process.env.USERPROFILE || '';
  const c = path.join(
    home,
    'AppData/Roaming/npm/node_modules/@mimo-ai/cli/node_modules/@mimo-ai/mimocode-windows-x64/bin/mimo.exe'
  );
  return fs.existsSync(c) ? c : null;
}

function health(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/global/health', timeout: 2000 }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

describe('cli serve smoke', () => {
  it('spawns serve, health 200, kills only child', async () => {
    const bin = findMimo();
    if (!bin) {
      console.log('SKIP no mimo.exe');
      return;
    }
    const port = 18770 + Math.floor(Math.random() * 20);
    const child = spawn(bin, ['serve', '--port', String(port), '--hostname', '127.0.0.1'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    const pid = child.pid;
    assert.ok(pid);
    let ok = false;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 400));
      const h = await health(port);
      if (h && h.status === 200) {
        ok = true;
        assert.ok(/healthy/i.test(h.body));
        break;
      }
    }
    try {
      if (process.platform === 'win32') {
        execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      } else {
        child.kill('SIGTERM');
      }
    } catch {
      /* */
    }
    assert.ok(ok, 'serve never healthy');
  });
});

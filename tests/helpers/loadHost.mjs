import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../..');
const stamp = path.join(root, 'out-test', '.ok');

let built = false;
export function ensureHostBundles() {
  if (built && fs.existsSync(stamp)) return;
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/export-host-for-tests.mjs')], {
    cwd: root,
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    console.error(r.stdout, r.stderr);
    throw new Error('export-host-for-tests failed');
  }
  fs.writeFileSync(stamp, String(Date.now()));
  built = true;
}

export function loadHost(name) {
  ensureHostBundles();
  const require = createRequire(import.meta.url);
  return require(path.join(root, 'out-test', name + '.js'));
}

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.297';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// undo/redo soft select (preserve scroll)
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  let n = 0;
  // only the post-undo reload (not new session hard open)
  const a = 'await this.selectSession(sid);';
  const b = 'await this.selectSession(sid, { soft: true }); // SOFT_AFTER_UNDO';
  // replace only after Undo applied block — first occurrence after 'Undo applied'
  const ui = h.indexOf("text: 'Undo applied'");
  if (ui >= 0) {
    const sub = h.slice(ui, ui + 400);
    if (sub.includes(a) && !sub.includes('SOFT_AFTER_UNDO')) {
      h = h.slice(0, ui) + sub.replace(a, b) + h.slice(ui + sub.length);
      n++;
    }
  }
  // redo
  const ri = h.indexOf("text: 'Redo applied'") >= 0 ? h.indexOf("text: 'Redo applied'") : h.indexOf('redone');
  if (ri >= 0) {
    const sub = h.slice(ri, ri + 400);
    if (sub.includes(a) && !sub.includes('SOFT_AFTER_REDO')) {
      h =
        h.slice(0, ri) +
        sub.replace(a, 'await this.selectSession(sid, { soft: true }); // SOFT_AFTER_REDO') +
        h.slice(ri + sub.length);
      n++;
    } else if (sub.includes('selectSession(snap.sessionId)') && !sub.includes('SOFT_AFTER_REDO')) {
      h =
        h.slice(0, ri) +
        sub.replace(
          'selectSession(snap.sessionId)',
          "selectSession(snap.sessionId, { soft: true }) // SOFT_AFTER_REDO"
        ) +
        h.slice(ri + sub.length);
      n++;
    }
  }
  // broader: selectSession(snap.sessionId) without soft
  if (h.includes('selectSession(snap.sessionId)') && !h.includes('SOFT_AFTER_REDO')) {
    h = h.replace(
      'selectSession(snap.sessionId)',
      "selectSession(snap.sessionId, { soft: true }) // SOFT_AFTER_REDO"
    );
    n++;
  }
  fs.writeFileSync('src/host/SidebarProvider.ts', h);
  console.log('soft undo/redo', n, h.includes('SOFT_AFTER_UNDO'), h.includes('SOFT_AFTER_REDO'));
}

// Webview: toast when soft session reload after undo arrives - skip
// Soft: /export while busy still works

// Host soft: when hard selectSession after newSession - keep hard (pin bottom)

// Functional: when soft streamDone also refreshUsage - host
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (h.includes('soft: true') && !h.includes('// SOFT_DONE_USAGE')) {
    h = h.replace(
      'if (this.currentSessionId === sid) void this.selectSession(sid, { soft: true });',
      "if (this.currentSessionId === sid) {\n            void this.selectSession(sid, { soft: true }); // SOFT_DONE_USAGE\n            void this.client.fetchSessionUsage(sid).then((u) => {\n              if (u && this.currentSessionId === sid)\n                this.post({ type: 'sessionUsage', sessionId: sid, used: u.used, size: u.size, amount: u.amount });\n            });\n          }"
    );
    fs.writeFileSync('src/host/SidebarProvider.ts', h);
    console.log('soft done usage', h.includes('SOFT_DONE_USAGE'));
  }
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = VER;
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');

run('npx tsc -p ./');
run('node scripts/build-webview.mjs');

let fail = 0;
for (const t of [
  'tests/unit/sessionFilter.test.mjs',
  'tests/unit/mimoPart.test.mjs',
  'tests/e2e/db-format.test.mjs',
]) {
  try {
    execSync(`node --test ${t}`, { stdio: 'pipe', env });
  } catch {
    fail++;
  }
}
console.log('FAIL=' + fail);

const vsixName = `mimo-vscode-v2-${VER}.vsix`;
run(`npx --yes @vscode/vsce package --no-dependencies --out ${vsixName}`);

const vsix = path.resolve(vsixName);
const extRoot = path.join(os.homedir(), '.vscode', 'extensions');
const tmp = path.join(os.tmpdir(), 'mimo-b297-' + Math.random().toString(36).slice(2, 8));
fs.mkdirSync(tmp, { recursive: true });
const ps = `Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory('${vsix.replace(/'/g, "''")}', '${tmp.replace(/'/g, "''")}')`;
execSync(`powershell -NoProfile -Command "${ps}"`, { stdio: 'inherit' });

const src = path.join(tmp, 'extension');
function copyDir(s, d) {
  fs.mkdirSync(d, { recursive: true });
  for (const ent of fs.readdirSync(s, { withFileTypes: true })) {
    const sp = path.join(s, ent.name);
    const dp = path.join(d, ent.name);
    if (ent.isDirectory()) copyDir(sp, dp);
    else fs.copyFileSync(sp, dp);
  }
}
for (const folder of [
  `mimo.mimo-vscode-${VER}`,
  'mimo.mimo-vscode-1.0.0-beta.296',
  'mimo.mimo-vscode-1.0.0-beta.295',
]) {
  copyDir(src, path.join(extRoot, folder));
}

let fix = fs.readFileSync('scripts/fix-extensions-json.mjs', 'utf8');
if (!fix.includes(VER)) {
  fix = fix.replace(
    'const preferred = [',
    `const preferred = [\n  'mimo.mimo-vscode-${VER}',`
  );
  fs.writeFileSync('scripts/fix-extensions-json.mjs', fix);
}
run('node scripts/fix-extensions-json.mjs');
run('git add -A');
try {
  execSync(
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: soft select after undo/redo; usage after turn; KEEP PORTING"`,
    { stdio: 'inherit' }
  );
} catch {
  console.log('commit skip');
}
try {
  execSync('git push origin v2-rewrite', { stdio: 'inherit' });
} catch {
  console.log('push fail');
}
console.log('TIP=' + VER + ' FAIL=' + fail + ' KEEP_PORTING');

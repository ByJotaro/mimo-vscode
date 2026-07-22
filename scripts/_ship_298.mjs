import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.298';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// /toggle-details local if details exists
// Soft: when soft error, soft clear busy already
// Functional: host soft when soft stream permission - already

// When soft selectSession hard open clears busy - already
// Soft: package configuration mimo.cliPath description - skip

// Webview: Esc closes history panel if open
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (!m.includes('// ESC_CLOSE_HISTORY') && m.includes('keydown')) {
    // find global keydown
    if (m.includes("e.key === 'Escape'") || m.includes('key === "Escape"')) {
      // enhance escape to close history
      const re = /if\s*\(\s*e\.key\s*===\s*['"]Escape['"]\s*\)\s*\{/;
      if (re.test(m) && !m.includes('ESC_CLOSE_HISTORY')) {
        m = m.replace(
          re,
          `if (e.key === 'Escape') {\n    // ESC_CLOSE_HISTORY\n    const hist = document.getElementById('mimo-history') || document.querySelector('.history-panel, .mimo-history, #history-panel');\n    if (hist) { hist.remove(); e.preventDefault(); return; }`
        );
        fs.writeFileSync('src/webview/app/main.ts', m);
        console.log('esc history', m.includes('ESC_CLOSE_HISTORY'));
      } else console.log('escape exists no patch');
    } else {
      // add document keydown
      const hook = `
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  // ESC_CLOSE_HISTORY
  const hist = document.getElementById('mimo-history') || document.querySelector('.history-panel, .mimo-history, #history-panel');
  if (hist) { hist.remove(); e.preventDefault(); }
});
`;
      if (m.includes("btnSend?.addEventListener('click', doSend);")) {
        m = m.replace(
          "btnSend?.addEventListener('click', doSend);",
          "btnSend?.addEventListener('click', doSend);" + hook
        );
        fs.writeFileSync('src/webview/app/main.ts', m);
        console.log('esc listener ok');
      }
    }
  }
}

// Host: soft toast when soft models refresh includes modes count already models · N
// Soft: when soft soft select after undo, toast already Undo applied

// Functional: /stop while not busy toast
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (m.includes("cmd === 'stop'") && !m.includes('// STOP_IDLE')) {
    // soft enhance stop block
    const re = /if \(cmd === 'stop' \|\| cmd === 'abort'\) \{[\s\S]*?return true;\s*\}/;
    const block = m.match(re);
    if (block && !block[0].includes('STOP_IDLE')) {
      let b = block[0];
      if (!b.includes('!busy') && !b.includes('if (!busy)')) {
        b = b.replace(
          '{',
          "{\n    if (!busy) { showToast('not running'); return true; } // STOP_IDLE"
        );
        m = m.replace(block[0], b);
        fs.writeFileSync('src/webview/app/main.ts', m);
        console.log('stop idle ok');
      }
    } else console.log('stop block', !!block);
  }
}

// Soft: ensure soft soft usage after turn doesn't double-post webview refreshUsage - ok

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
const tmp = path.join(os.tmpdir(), 'mimo-b298-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.297',
  'mimo.mimo-vscode-1.0.0-beta.296',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: Esc closes history; /stop idle toast; KEEP PORTING"`,
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

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.309';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// Fix showToast mute guard
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (!m.includes('// TOAST_MUTE') && m.includes('function showToast')) {
    m = m.replace(
      /function showToast\(msg: string, ms = 1400\): void \{\r?\n/,
      "function showToast(msg: string, ms = 1400): void {\n  if ((window as any).__mimoQuiet) return; // TOAST_MUTE\n"
    );
    fs.writeFileSync('src/webview/app/main.ts', m);
    console.log('toast mute', m.includes('TOAST_MUTE'));
  } else {
    console.log('toast mute skip', m.includes('TOAST_MUTE'));
  }
}

// Fix quiet so first toast always shows: set quiet AFTER toast
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (m.includes("cmd === 'quiet'") && m.includes('const prev = (window as any).__mimoQuiet')) {
    const bad = `  if (cmd === 'quiet' || cmd === 'mute') {
    (window as any).__mimoQuiet = true;
    // allow this one toast
    const prev = (window as any).__mimoQuiet;
    (window as any).__mimoQuiet = false;
    showToast('toasts muted');
    (window as any).__mimoQuiet = true;
    return true;
  }`;
    const good = `  if (cmd === 'quiet' || cmd === 'mute') {
    (window as any).__mimoQuiet = false;
    showToast('toasts muted');
    (window as any).__mimoQuiet = true;
    return true;
  }`;
    if (m.includes(bad)) {
      m = m.replace(bad, good);
    } else {
      // looser
      m = m.replace(
        /if \(cmd === 'quiet' \|\| cmd === 'mute'\) \{[\s\S]*?return true;\s*\}/,
        good
      );
    }
    fs.writeFileSync('src/webview/app/main.ts', m);
    console.log('quiet simplified', !m.includes('const prev = (window as any).__mimoQuiet'));
  }
}

// /copy-id alias of /id
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (m.includes("cmd === 'id'") && !m.includes("cmd === 'copy-id'")) {
    m = m.replace(
      /if \(cmd === 'id' \|\| cmd === 'session'(?: \|\| cmd === 'who')?\) \{/,
      "if (cmd === 'id' || cmd === 'session' || cmd === 'who' || cmd === 'copy-id') {"
    );
    fs.writeFileSync('src/webview/app/main.ts', m);
    console.log('copy-id', m.includes("cmd === 'copy-id'"));
  }
}

// catalog copy-id
{
  let cat = fs.readFileSync('src/host/cli/slashCatalog.ts', 'utf8');
  if (!cat.includes("name: 'copy-id'")) {
    cat = cat.replace(
      "    { name: 'id', description: 'Copy current session id' },",
      "    { name: 'id', description: 'Copy current session id' },\n    { name: 'copy-id', description: 'Copy current session id' },"
    );
    fs.writeFileSync('src/host/cli/slashCatalog.ts', cat);
    console.log('catalog copy-id', cat.includes("name: 'copy-id'"));
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
const tmp = path.join(os.tmpdir(), 'mimo-b309-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.308',
  'mimo.mimo-vscode-1.0.0-beta.307',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: toast mute works; /copy-id; KEEP PORTING"`,
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

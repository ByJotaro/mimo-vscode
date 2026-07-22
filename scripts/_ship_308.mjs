import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.308';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// /paths → doctor
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (!m.includes("cmd === 'paths'")) {
    const ins = `  if (cmd === 'paths') {
    showToast('paths…');
    post({ type: 'doctor' });
    return true;
  }
`;
    if (m.includes("  if (cmd === 'doctor')")) {
      m = m.replace("  if (cmd === 'doctor')", ins + "  if (cmd === 'doctor')");
    } else if (m.includes("  if (cmd === 'help')")) {
      m = m.replace("  if (cmd === 'help')", ins + "  if (cmd === 'help')");
    } else {
      console.log('paths anchor miss');
      process.exit(1);
    }
    fs.writeFileSync('src/webview/app/main.ts', m);
    console.log('paths ok');
  }
}

// catalog
{
  let cat = fs.readFileSync('src/host/cli/slashCatalog.ts', 'utf8');
  if (!cat.includes("name: 'paths'")) {
    cat = cat.replace(
      "    { name: 'doctor', description: 'Extension diagnostics (bin/db/sqlite)' },",
      "    { name: 'doctor', description: 'Extension diagnostics (bin/db/sqlite)' },\n    { name: 'paths', description: 'Show key paths (via doctor)' },"
    );
    fs.writeFileSync('src/host/cli/slashCatalog.ts', cat);
    console.log('catalog paths', cat.includes("name: 'paths'"));
  }
}

// /quiet — mute toasts until /noisy
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (!m.includes("cmd === 'quiet'") && !m.includes('// TOAST_MUTE')) {
    // wrap showToast if function exists
    if (m.includes('function showToast(') && !m.includes('// TOAST_MUTE')) {
      m = m.replace(
        /function showToast\([^)]*\)\s*\{/,
        (s) =>
          s +
          "\n  if ((window as any).__mimoQuiet) return; // TOAST_MUTE"
      );
    }
    const ins = `  if (cmd === 'quiet' || cmd === 'mute') {
    (window as any).__mimoQuiet = true;
    // allow this one toast
    const prev = (window as any).__mimoQuiet;
    (window as any).__mimoQuiet = false;
    showToast('toasts muted');
    (window as any).__mimoQuiet = true;
    return true;
  }
  if (cmd === 'noisy' || cmd === 'unmute') {
    (window as any).__mimoQuiet = false;
    showToast('toasts on');
    return true;
  }
`;
    if (m.includes("  if (cmd === 'paths')")) {
      m = m.replace("  if (cmd === 'paths')", ins + "  if (cmd === 'paths')");
    } else if (m.includes("  if (cmd === 'help')")) {
      m = m.replace("  if (cmd === 'help')", ins + "  if (cmd === 'help')");
    }
    fs.writeFileSync('src/webview/app/main.ts', m);
    console.log('quiet/noisy', m.includes("cmd === 'quiet'"), m.includes('TOAST_MUTE'));
  }
}

// catalog quiet
{
  let cat = fs.readFileSync('src/host/cli/slashCatalog.ts', 'utf8');
  if (!cat.includes("name: 'quiet'")) {
    cat = cat.replace(
      "    { name: 'paths', description: 'Show key paths (via doctor)' },",
      "    { name: 'paths', description: 'Show key paths (via doctor)' },\n    { name: 'quiet', description: 'Mute toasts' },\n    { name: 'noisy', description: 'Unmute toasts' },"
    );
    fs.writeFileSync('src/host/cli/slashCatalog.ts', cat);
    console.log('catalog quiet', cat.includes("name: 'quiet'"));
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
const tmp = path.join(os.tmpdir(), 'mimo-b308-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.307',
  'mimo.mimo-vscode-1.0.0-beta.306',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: /paths; /quiet /noisy toast mute; KEEP PORTING"`,
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

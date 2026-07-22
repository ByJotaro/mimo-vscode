import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.306';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// Host: toast when sessions list is empty
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (!h.includes('// EMPTY_SESSIONS_TOAST') && h.includes("type: 'sessionsList'")) {
    h = h.replace(
      /this\.post\(\{\s*type:\s*'sessionsList',\s*sessions:\s*([^,}]+)([^}]*)\}\);/,
      (full, sessionsExpr) =>
        full +
        `\n    if (!((${sessionsExpr}) || []).length) this.post({ type: 'toast', text: 'no sessions' }); // EMPTY_SESSIONS_TOAST`
    );
    if (!h.includes('EMPTY_SESSIONS_TOAST')) {
      h = h.replace(
        /this\.post\(\{\r?\n\s*type:\s*'sessionsList',\r?\n\s*sessions:\s*([^,\r\n]+)([^}]*)\}\);/,
        (full, sessionsExpr) =>
          full +
          `\r\n    if (!((${sessionsExpr}) || []).length) this.post({ type: 'toast', text: 'no sessions' }); // EMPTY_SESSIONS_TOAST`
      );
    }
    fs.writeFileSync('src/host/SidebarProvider.ts', h);
    console.log('empty sessions toast', h.includes('EMPTY_SESSIONS_TOAST'));
  } else {
    console.log('empty sessions skip', h.includes('EMPTY_SESSIONS_TOAST'));
  }
}

// /time local
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (!m.includes("cmd === 'time'") && !m.includes("cmd === 'now'")) {
    const ins = `  if (cmd === 'time' || cmd === 'now') {
    const d = new Date();
    const iso = d.toISOString();
    const local = d.toLocaleString();
    showToast(local);
    appendOrUpdateMessage({
      id: 'sys_time_' + Date.now(),
      role: 'assistant',
      text:
        '**Time**\\n- local: \`' +
        local +
        '\`\\n- utc: \`' +
        iso +
        '\`\\n- session: \`' +
        (activeSessionId || '(home)') +
        '\`',
    });
    return true;
  }
`;
    if (m.includes("  if (cmd === 'count')")) {
      m = m.replace("  if (cmd === 'count')", ins + "  if (cmd === 'count')");
    } else if (m.includes("  if (cmd === 'version'")) {
      m = m.replace("  if (cmd === 'version'", ins + "  if (cmd === 'version'");
    } else if (m.includes("  if (cmd === 'help')")) {
      m = m.replace("  if (cmd === 'help')", ins + "  if (cmd === 'help')");
    } else {
      console.log('time anchor miss');
      process.exit(1);
    }
    fs.writeFileSync('src/webview/app/main.ts', m);
    console.log('time slash ok');
  } else {
    console.log('time exists');
  }
}

// catalog
{
  let cat = fs.readFileSync('src/host/cli/slashCatalog.ts', 'utf8');
  if (!cat.includes("name: 'time'")) {
    cat = cat.replace(
      "    { name: 'count', description: 'Count messages/tools in view' },",
      "    { name: 'count', description: 'Count messages/tools in view' },\n    { name: 'time', description: 'Show local/UTC time' },\n    { name: 'now', description: 'Show local/UTC time' },"
    );
    if (!cat.includes("name: 'time'")) {
      cat = cat.replace(
        "    { name: 'version', description: 'Show extension package version' },",
        "    { name: 'version', description: 'Show extension package version' },\n    { name: 'time', description: 'Show local/UTC time' },"
      );
    }
    fs.writeFileSync('src/host/cli/slashCatalog.ts', cat);
    console.log('catalog time', cat.includes("name: 'time'"));
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
const tmp = path.join(os.tmpdir(), 'mimo-b306-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.305',
  'mimo.mimo-vscode-1.0.0-beta.304',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: /time; empty sessions toast; KEEP PORTING"`,
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

try {
  const notes =
    process.env.USERPROFILE +
    '/.local/share/mimocode/memory/sessions/ses_0926fd416ffeyXG0Mc5SdUf7G4/notes.md';
  fs.appendFileSync(
    notes,
    `\n## [turn · 2026-07-22 ${VER} continuous]\n- Tip **${VER}** — Reload Window\n- /time; empty history toast; T21 visual AFTER full port\n- FAIL=${fail}; KEEP PORTING\n`
  );
} catch {
  /* ignore */
}

console.log('TIP=' + VER + ' FAIL=' + fail + ' KEEP_PORTING');

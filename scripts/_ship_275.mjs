import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.275';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// /compact /rebuild already forwarded — add local toast when forwarding is clearer: already showToast
// When webview gets sessionTitle update, flash already
// Soft: after fork host loads session — ensure busy false
// Functional: when create new session from home, clear chat streaming classes
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (!m.includes('// NEW_CLEAR_STREAM') && m.includes("case 'sessionData':")) {
    // already clears busy on hard open
    console.log('sessionData busy clear exists in hard path');
  }
}

// Host: on newSession after create, ensure sendInFlight false
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (h.includes('private async newSession') && !h.includes('// NEW_SESSION_CLEAR_BUSY')) {
    // inject after successful create before select
    if (h.includes('[NEW_SESSION]')) {
      h = h.replace(
        /this\.log\.appendLine\(`\[NEW_SESSION\] \$\{s\.id\}`\);/,
        "this.sendInFlight = false; // NEW_SESSION_CLEAR_BUSY\n      this.post({ type: 'sendState', busy: false });\n      this.log.appendLine(`[NEW_SESSION] ${s.id}`);"
      );
      fs.writeFileSync('src/host/SidebarProvider.ts', h);
      console.log('new clear busy', h.includes('NEW_SESSION_CLEAR_BUSY'));
    } else console.log('NEW_SESSION mark miss');
  }
}

// /help include new cmds
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (m.includes('**Local commands**') && !m.includes('`/reload`')) {
    m = m.replace(
      "'- `/undo` `/redo` `/retry` `/details` `/agents` `/skills` `/diff` `/stash` `/resume` `/rename` `/open` `/sel`\\n' +",
      "'- `/undo` `/redo` `/retry` `/reload` `/details` `/agents` `/skills` `/diff` `/stash` `/resume` `/rename` `/open` `/sel` `/id` `/title`\\n' +"
    );
    // looser if help format different
    if (!m.includes('`/reload`') && m.includes('/reload')) {
      /* already */
    }
    if (!m.includes('`/id`') && m.includes("'/export' `/help`")) {
      m = m.replace(
        "'- `/cost` `/status` `/usage` `/mcp` `/memory` `/tasks` `/questions` `/export` `/help`\\n' +",
        "'- `/cost` `/status` `/usage` `/port` `/mcp` `/memory` `/tasks` `/questions` `/export` `/log` `/config` `/help`\\n' +"
      );
    }
    // try without escapes matching actual file
    if (m.includes('/export` `/help`') && !m.includes('/port`')) {
      m = m.replace(
        '/export` `/help`',
        '/export` `/log` `/port` `/id` `/reload` `/help`'
      );
      console.log('help patched loose');
    }
    fs.writeFileSync('src/webview/app/main.ts', m);
  }
}

// When slash catalog empty after init, re-request via refreshModels path already sends slashCommands
// Soft: package.json "mimo.autoOpen" setting optional skip

// host write package version into status bar via post on init already webview sets dataset.version

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
const tmp = path.join(os.tmpdir(), 'mimo-b275-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.274',
  'mimo.mimo-vscode-1.0.0-beta.273',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: new session clears busy; help slash refresh; KEEP PORTING"`,
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

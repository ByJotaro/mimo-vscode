import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.295';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// Host: soft toast when soft selectSession hard open already
// Functional: when export while no session - toast
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (h.includes("case 'requestExport'") || h.includes('saveExport')) {
    console.log('export exists');
  }
  // when soft listSessions fails
}

// Webview: /agents local list modes already
// Soft: when soft permission always, clear busy soft
// Functional: host when setMode, toast already?

// Soft: /mode with rest switches
// already agent/mode local

// Host: when soft workspace folder change - toast "workspace changed"
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (h.includes('workspaceChanged') || h.includes('onDidChangeWorkspaceFolders')) {
    // find handler
    const i = h.indexOf('workspaceChanged');
    if (i < 0) {
      const j = h.indexOf('WorkspaceFolders');
      console.log('ws folders', j >= 0 ? h.slice(j, j + 200) : 'none');
    } else if (!h.includes('// WS_CHANGE_TOAST')) {
      // try inject toast after re-init start
      console.log('workspaceChanged sample', h.slice(i, i + 250));
    }
  }
}

// activate workspace folder - already re-init
// Soft: post toast from activate? host sendInit

// Functional: soft when soft streamDone and no activeSessionId, still setBusy false
// already

// Host soft: soft select after done uses soft:true - verify still
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  const softCount = (h.match(/soft:\s*true/g) || []).length;
  console.log('soft:true count', softCount);
}

// /who local = /id
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (!m.includes("cmd === 'who'")) {
    m = m.replace(
      "  if (cmd === 'id' || cmd === 'session') {",
      "  if (cmd === 'id' || cmd === 'session' || cmd === 'who') {"
    );
    fs.writeFileSync('src/webview/app/main.ts', m);
    console.log('who alias', m.includes("cmd === 'who'"));
  }
}

// Soft: when soft goHome, also clear permission/question UI if open
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (m.includes('HOME_CLEAR_BUSY') && !m.includes('// HOME_CLEAR_PANELS')) {
    // after setBusy(false) on home
    m = m.replace(
      'setBusy(false); // HOME_CLEAR_BUSY',
      "setBusy(false); // HOME_CLEAR_BUSY\n        document.getElementById('mimo-permission')?.remove();\n        document.getElementById('mimo-question')?.remove();\n        document.querySelectorAll('.mimo-perm, .mimo-question, .permission-panel, .question-panel').forEach((el) => el.remove()); // HOME_CLEAR_PANELS"
    );
    fs.writeFileSync('src/webview/app/main.ts', m);
    console.log('home clear panels', m.includes('HOME_CLEAR_PANELS'));
  }
}

// package version bump
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
const tmp = path.join(os.tmpdir(), 'mimo-b295-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.294',
  'mimo.mimo-vscode-1.0.0-beta.293',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: /who alias; home clears perm/question panels; KEEP PORTING"`,
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

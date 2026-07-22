import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.270';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// host undo/redo toasts
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  const u1 =
    "case 'undoLast':\n          await this.runGitUndo();\n          break;";
  const u1n =
    "case 'undoLast':\n          await this.runGitUndo();\n          this.post({ type: 'toast', text: 'undone' });\n          break;";
  const u1c =
    "case 'undoLast':\r\n          await this.runGitUndo();\r\n          break;";
  const u1cn =
    "case 'undoLast':\r\n          await this.runGitUndo();\r\n          this.post({ type: 'toast', text: 'undone' });\r\n          break;";
  const r1 =
    "case 'redoLast':\n          await this.runGitRedo();\n          break;";
  const r1n =
    "case 'redoLast':\n          await this.runGitRedo();\n          this.post({ type: 'toast', text: 'redone' });\n          break;";
  const r1c =
    "case 'redoLast':\r\n          await this.runGitRedo();\r\n          break;";
  const r1cn =
    "case 'redoLast':\r\n          await this.runGitRedo();\r\n          this.post({ type: 'toast', text: 'redone' });\r\n          break;";
  if (h.includes(u1)) h = h.replace(u1, u1n);
  else if (h.includes(u1c)) h = h.replace(u1c, u1cn);
  if (h.includes(r1)) h = h.replace(r1, r1n);
  else if (h.includes(r1c)) h = h.replace(r1c, r1cn);
  fs.writeFileSync('src/host/SidebarProvider.ts', h);
  console.log('undo toast', h.includes("text: 'undone'"));
}

// /reload slash
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (!m.includes("cmd === 'reload'")) {
    const ins = `  if (cmd === 'reload' || cmd === 'refresh') {
    if (!activeSessionId) {
      showToast('no session');
      return true;
    }
    showToast('reload…');
    post({ type: 'selectSession', sessionId: activeSessionId, soft: true });
    post({ type: 'refreshUsage', sessionId: activeSessionId });
    return true;
  }
`;
    if (m.includes("  if (cmd === 'retry') {")) {
      m = m.replace("  if (cmd === 'retry') {", ins + "  if (cmd === 'retry') {");
      fs.writeFileSync('src/webview/app/main.ts', m);
      console.log('reload ok');
    } else console.log('retry miss');
  } else console.log('reload exists');
}

// catalog
{
  let cat = fs.readFileSync('src/host/cli/slashCatalog.ts', 'utf8');
  if (!cat.includes("name: 'reload'")) {
    cat = cat.replace(
      "    { name: 'retry', description: 'Retry last message' },",
      "    { name: 'retry', description: 'Retry last message' },\n    { name: 'reload', description: 'Soft-reload current session from DB' },\n    { name: 'refresh', description: 'Soft-reload current session from DB' },"
    );
    fs.writeFileSync('src/host/cli/slashCatalog.ts', cat);
    console.log('catalog ok');
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
const tmp = path.join(os.tmpdir(), 'mimo-b270-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.269',
  'mimo.mimo-vscode-1.0.0-beta.268',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: /reload soft session; undo/redo toasts; KEEP PORTING"`,
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

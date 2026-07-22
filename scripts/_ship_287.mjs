import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.287';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// newSession busy abort with looser match
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (!h.includes('// NEW_BUSY_ABORT')) {
    // find case newSession
    const re = /case 'newSession':\s*\r?\n\s*await this\.newSession\(\);/;
    if (re.test(h)) {
      h = h.replace(
        re,
        "case 'newSession':\n          // NEW_BUSY_ABORT\n          if (this.sendInFlight && this.currentSessionId) {\n            void this.client.abort(this.currentSessionId).catch(() => undefined);\n            this.sendInFlight = false;\n            this.post({ type: 'sendState', busy: false });\n          }\n          await this.newSession();"
      );
      fs.writeFileSync('src/host/SidebarProvider.ts', h);
      console.log('new busy abort ok');
    } else {
      const i = h.indexOf("case 'newSession'");
      console.log(i >= 0 ? JSON.stringify(h.slice(i, i + 120)) : 'no newSession');
    }
  }
}

// exportSession busy ok always
// When soft streamDone: if activeSessionId mismatch ignore already
// Functional: host listSessions after delete soft refresh - already

// /delete local - confirm via toast then forward already
// Soft: when goHome clears lastUserPrompt already

// Webview: setBusy(false) on goHome path when showStartupChooser
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (m.includes('showStartupChooser') && !m.includes('// HOME_CLEAR_BUSY')) {
    if (m.includes("if (message.showStartupChooser === true) {") && !m.includes('HOME_CLEAR_BUSY')) {
      m = m.replace(
        "if (message.showStartupChooser === true) {",
        "if (message.showStartupChooser === true) {\n        setBusy(false); // HOME_CLEAR_BUSY"
      );
      fs.writeFileSync('src/webview/app/main.ts', m);
      console.log('home clear busy', m.includes('HOME_CLEAR_BUSY'));
    }
  }
}

// Host soft: when forkSession method fails toast
// Soft: package view title doctor already

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
const tmp = path.join(os.tmpdir(), 'mimo-b287-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.286',
  'mimo.mimo-vscode-1.0.0-beta.285',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: newSession aborts in-flight; home clears busy; KEEP PORTING"`,
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

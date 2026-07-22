import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.286';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// fork while busy → toast and skip
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (!h.includes('// FORK_BUSY_GUARD')) {
    const a =
      "case 'forkSession':\n          await this.forkSession();\n          break;";
    const b =
      "case 'forkSession':\n          // FORK_BUSY_GUARD\n          if (this.sendInFlight) {\n            this.post({ type: 'toast', text: 'wait — still running' });\n            break;\n          }\n          await this.forkSession();\n          break;";
    if (h.includes(a)) {
      h = h.replace(a, b);
      fs.writeFileSync('src/host/SidebarProvider.ts', h);
      console.log('fork busy ok');
    } else {
      const a2 = a.replace(/\n/g, '\r\n');
      if (h.includes(a2)) {
        h = h.replace(a2, b.replace(/\n/g, '\r\n'));
        fs.writeFileSync('src/host/SidebarProvider.ts', h);
        console.log('fork busy crlf');
      } else console.log('fork case miss');
    }
  }
}

// export while busy ok; new session while busy abort first soft
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (!h.includes('// NEW_BUSY_ABORT') && h.includes("case 'newSession'")) {
    const a = "case 'newSession':\n          await this.newSession();";
    if (h.includes(a) && !h.includes('NEW_BUSY_ABORT')) {
      h = h.replace(
        a,
        "case 'newSession':\n          // NEW_BUSY_ABORT\n          if (this.sendInFlight && this.currentSessionId) {\n            void this.client.abort(this.currentSessionId).catch(() => undefined);\n            this.sendInFlight = false;\n            this.post({ type: 'sendState', busy: false });\n          }\n          await this.newSession();"
      );
      fs.writeFileSync('src/host/SidebarProvider.ts', h);
      console.log('new busy abort', h.includes('NEW_BUSY_ABORT'));
    } else {
      // try method-only path
      console.log('newSession case shape', h.includes("case 'newSession'"));
    }
  }
}

// webview: after empty send toast already; when slash unknown still forwards
// Soft: /help hotkeys mention focusPrompt Ctrl+Shift+Alt+P - optional

// When models refresh fails toast already
// Soft: status bar click already openSidebar

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
const tmp = path.join(os.tmpdir(), 'mimo-b286-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.285',
  'mimo.mimo-vscode-1.0.0-beta.284',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: fork busy guard; new aborts in-flight; KEEP PORTING"`,
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

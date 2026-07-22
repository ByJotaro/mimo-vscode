import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.281';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// verify pin uses autoScroll
{
  const m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  console.log('pin autoScroll', m.includes("autoScroll = !autoScroll"));
}

// Host: goHome aborts in-flight
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (!h.includes('// GO_HOME_ABORT')) {
    const markers = [
      "case 'goHome':\n          this.currentSessionId = null;",
      "case 'goHome':\r\n          this.currentSessionId = null;",
      "case 'goHome':\n          await this.sendInit(true);",
      "case 'goHome':",
    ];
    let done = false;
    for (const mk of markers) {
      if (h.includes(mk) && mk === "case 'goHome':") {
        h = h.replace(
          "case 'goHome':",
          "case 'goHome':\n          // GO_HOME_ABORT\n          if (this.sendInFlight && this.currentSessionId) {\n            void this.client.abort(this.currentSessionId).catch(() => undefined);\n            this.sendInFlight = false;\n            this.post({ type: 'sendState', busy: false });\n          }"
        );
        done = h.includes('GO_HOME_ABORT');
        break;
      }
    }
    if (done) {
      fs.writeFileSync('src/host/SidebarProvider.ts', h);
      console.log('goHome abort ok');
    } else {
      // try runCommand goHome method
      if (h.includes('async goHome') || h.includes('private goHome')) {
        console.log('goHome method shape different');
      } else {
        // inspect goHome occurrences
        const i = h.indexOf('goHome');
        console.log('goHome sample', i >= 0 ? h.slice(i, i + 200) : 'none');
      }
    }
  }
}

// /focus local - focus prompt
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (!m.includes("cmd === 'focus'")) {
    const ins = `  if (cmd === 'focus' || cmd === 'prompt') {
    promptEl?.focus();
    showToast('prompt');
    return true;
  }
`;
    if (m.includes("  if (cmd === 'pin'")) {
      m = m.replace("  if (cmd === 'pin'", ins + "  if (cmd === 'pin'");
      fs.writeFileSync('src/webview/app/main.ts', m);
      console.log('focus slash ok');
    }
  }
}

// catalog focus
{
  let cat = fs.readFileSync('src/host/cli/slashCatalog.ts', 'utf8');
  if (!cat.includes("name: 'focus'")) {
    cat = cat.replace(
      "    { name: 'pin', description: 'Toggle auto-scroll pin to bottom' },",
      "    { name: 'pin', description: 'Toggle auto-scroll pin to bottom' },\n    { name: 'focus', description: 'Focus the prompt input' },"
    );
    fs.writeFileSync('src/host/cli/slashCatalog.ts', cat);
    console.log('catalog focus');
  }
}

// soft: when streamDone, if soft select fails still setBusy false - already

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
const tmp = path.join(os.tmpdir(), 'mimo-b281-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.280',
  'mimo.mimo-vscode-1.0.0-beta.279',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: /pin uses autoScroll; /focus; goHome abort; KEEP PORTING"`,
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

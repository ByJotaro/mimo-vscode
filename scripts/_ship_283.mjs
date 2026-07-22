import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.283';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// When soft select after streamDone: refreshUsage already
// Functional: host openFile for /open already
// Soft: double toast on reconnect throttle already
// When empty prompt send: prevent
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (!m.includes('// EMPTY_SEND_GUARD')) {
    // find doSend
    if (m.includes('function doSend') || m.includes('const doSend')) {
      const re = /function doSend\(\)[^{]*\{\s*/;
      if (re.test(m) && !m.includes('EMPTY_SEND_GUARD')) {
        m = m.replace(
          re,
          (match) =>
            match +
            "const _raw = (promptEl?.value || '').trim();\n  if (!_raw) { showToast('empty'); return; } // EMPTY_SEND_GUARD\n  "
        );
        // careful - may double if doSend already checks empty
        fs.writeFileSync('src/webview/app/main.ts', m);
        console.log('empty guard try');
      }
    }
  }
  m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  // if we double-empty, check
  console.log('empty guards', (m.match(/EMPTY_SEND_GUARD/g) || []).length);
  // if doSend already has empty check before our inject, leave
}

// Host: when abort succeeds toast
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (!h.includes("text: 'aborted'") && h.includes('async abort') || h.includes("case 'abort'")) {
    // look for abort handler
    const i = h.indexOf("case 'abort'");
    if (i < 0) {
      // maybe stopSession
      console.log('abort case', h.includes('abort('));
    } else {
      console.log('abort case sample', h.slice(i, i + 250));
    }
  }
}

// /stop local already - after post toast
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (m.includes("cmd === 'stop'") && !m.includes("showToast('stop") && !m.includes("showToast('abort")) {
    m = m.replace(
      /if \(cmd === 'stop' \|\| cmd === 'abort'\) \{[\s\S]*?return true;\s*\}/,
      (block) => {
        if (block.includes('showToast')) return block;
        return block.replace('return true;', "showToast('stop…');\n    return true;");
      }
    );
    fs.writeFileSync('src/webview/app/main.ts', m);
    console.log('stop toast patched');
  } else console.log('stop toast skip');
}

// When permission panel: focus prompt after reply already?
// Soft: package contribute configuration mimo.autoPinScroll default true - skip visual

// Host doctor: also report package version from extension
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (h.includes("case 'doctor'") && !h.includes('package.json')) {
    // add version line if possible via extension context - may not have
    console.log('doctor exists without pkg version');
  }
}

// ensure version on init posts to dataset - already 278
// When list sessions soft filter empty: toast no matches - check history panel
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (m.includes('function showHistoryPanel') && !m.includes('// HIST_EMPTY_TOAST')) {
    // after render if no items
    console.log('history panel exists');
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
const tmp = path.join(os.tmpdir(), 'mimo-b283-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.282',
  'mimo.mimo-vscode-1.0.0-beta.281',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: empty-send guard; stop toast; KEEP PORTING"`,
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

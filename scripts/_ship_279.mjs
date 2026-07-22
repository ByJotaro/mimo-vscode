import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.279';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// Host: when dispose/deactivate, abort in-flight cleanly already dispose client
// Soft: when reconnect after fail, post toast - already throttled
// Functional: double-click status bar area already version - skip
// /share = /copy already
// When stream error card: soft clear live is-streaming classes on children
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (!m.includes('// CLEAR_STREAM_ON_ERROR') && m.includes("case 'error':")) {
    // find error case body start
    const re = /case 'error':\s*\n\s*setBusy\(false\);/;
    if (re.test(m)) {
      m = m.replace(
        re,
        "case 'error':\n      setBusy(false);\n      document.querySelectorAll('.is-streaming').forEach((el) => el.classList.remove('is-streaming')); // CLEAR_STREAM_ON_ERROR"
      );
      fs.writeFileSync('src/webview/app/main.ts', m);
      console.log('error clear stream ok');
    } else {
      // try without setBusy first
      if (m.includes("case 'error':") && !m.includes('CLEAR_STREAM_ON_ERROR')) {
        m = m.replace(
          "case 'error':",
          "case 'error':\n      document.querySelectorAll('.is-streaming').forEach((el) => el.classList.remove('is-streaming')); // CLEAR_STREAM_ON_ERROR"
        );
        fs.writeFileSync('src/webview/app/main.ts', m);
        console.log('error clear loose', m.includes('CLEAR_STREAM_ON_ERROR'));
      }
    }
  }
}

// Host soft: when forkSession succeeds toast already; when fails toast
// Functional: when editor selection empty on /sel - toast already
// Soft: package view/title menu for doctor
{
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = VER;
  if (!pkg.contributes.commands.find((c) => c.command === 'mimo.doctor')) {
    pkg.contributes.commands.push({
      command: 'mimo.doctor',
      title: 'MiMo Code: Doctor',
    });
    pkg.activationEvents.push('onCommand:mimo.doctor');
  }
  // view title menus
  if (!pkg.contributes.menus) pkg.contributes.menus = {};
  if (!pkg.contributes.menus['view/title']) pkg.contributes.menus['view/title'] = [];
  const vt = pkg.contributes.menus['view/title'];
  if (!vt.find((x) => x.command === 'mimo.doctor')) {
    vt.push({
      command: 'mimo.doctor',
      when: "view == mimo.sidebar",
      group: 'navigation@9',
    });
  }
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  console.log('doctor cmd');
}

{
  let a = fs.readFileSync('src/extension/activate.ts', 'utf8');
  if (!a.includes('mimo.doctor')) {
    a = a.replace(
      "vscode.commands.registerCommand('mimo.showLog', () =>\n      runHost(() => provider.runCommand('showLog'))\n    )",
      "vscode.commands.registerCommand('mimo.showLog', () =>\n      runHost(() => provider.runCommand('showLog'))\n    ),\n    vscode.commands.registerCommand('mimo.doctor', () =>\n      runHost(() => provider.runCommand('doctor'))\n    )"
    );
    if (!a.includes('mimo.doctor')) {
      a = a.replace(
        "vscode.commands.registerCommand('mimo.forkSession', () =>\n      runHost(() => provider.runCommand('forkSession'))\n    )",
        "vscode.commands.registerCommand('mimo.forkSession', () =>\n      runHost(() => provider.runCommand('forkSession'))\n    ),\n    vscode.commands.registerCommand('mimo.doctor', () =>\n      runHost(() => provider.runCommand('doctor'))\n    )"
      );
    }
    fs.writeFileSync('src/extension/activate.ts', a);
    console.log('activate doctor', a.includes('mimo.doctor'));
  }
}

// Host doctor case: also handle runCommand('doctor') - already case 'doctor'
// ensure runCommand passes through switch - already

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
const tmp = path.join(os.tmpdir(), 'mimo-b279-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.278',
  'mimo.mimo-vscode-1.0.0-beta.277',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: doctor palette/view; clear stream on error; KEEP PORTING"`,
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

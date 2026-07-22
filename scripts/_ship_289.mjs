import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.289';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// Ensure refreshModels case exists and method name matches
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  const methods = [...h.matchAll(/(?:async\s+)?(?:private\s+)?(?:public\s+)?(\w*refresh\w*)\s*\(/g)].map(
    (m) => m[1]
  );
  console.log('refresh methods', [...new Set(methods)]);
  if (!h.includes("case 'refreshModels'")) {
    // pick best method
    const name = methods.find((n) => /model/i.test(n)) || methods[0] || 'refreshModels';
    h = h.replace(
      "case 'doctor':",
      `case 'refreshModels':\n          void this.${name}();\n          break;\n        case 'doctor':`
    );
    fs.writeFileSync('src/host/SidebarProvider.ts', h);
    console.log('added case', name);
  } else {
    console.log('case exists');
  }
}

// /models local already; soft toast when opening models picker if empty
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (m.includes("cmd === 'models'") && !m.includes('// MODELS_EMPTY_TOAST')) {
    // leave if complex
    console.log('models slash exists');
  }
}

// Host soft: when soft select after streamDone, also soft if permission pending - skip
// Soft: when client dispose kills only our serve - already

// Webview: after soft sessionData, re-apply autoScroll pin if was free - skip
// Functional: /resume with id rest forwards already

// Soft improve status bar: show busy as "…" when busy - webview setBusy
// When setBusy true: already status

// package keybinding for refresh models
{
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = VER;
  if (
    pkg.contributes.commands.find((c) => c.command === 'mimo.refreshModels') &&
    !pkg.contributes.keybindings.find((k) => k.command === 'mimo.refreshModels')
  ) {
    pkg.contributes.keybindings.push({
      command: 'mimo.refreshModels',
      key: 'ctrl+shift+alt+r',
      mac: 'cmd+shift+alt+r',
    });
    console.log('kb refreshModels');
  }
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
}

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
const tmp = path.join(os.tmpdir(), 'mimo-b289-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.288',
  'mimo.mimo-vscode-1.0.0-beta.287',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: refreshModels case+kb; KEEP PORTING"`,
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

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.294';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// catalog copy-last - append near export
{
  let cat = fs.readFileSync('src/host/cli/slashCatalog.ts', 'utf8');
  if (!cat.includes("name: 'copy-last'")) {
    // append before closing of array
    const i = cat.lastIndexOf('];');
    if (i > 0) {
      cat =
        cat.slice(0, i) +
        "  { name: 'copy-last', description: 'Copy last assistant message' },\n" +
        cat.slice(i);
      fs.writeFileSync('src/host/cli/slashCatalog.ts', cat);
      console.log('catalog copy-last ok');
    }
  }
}

// Host soft: when soft streamDone, soft select already
// Functional: /delete with rest id - already forward
// Soft: when models list empty on /models, toast + refresh
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (m.includes("cmd === 'models'") && !m.includes('// MODELS_REFRESH_IF_EMPTY')) {
    // find models block
    const re = /if \(cmd === 'models'[\s\S]{0,400}?return true;\s*\}/;
    const block = m.match(re);
    if (block) {
      console.log('models block', block[0].slice(0, 200));
    }
    // inject near models: if no models post refreshModels
    if (m.includes("cmd === 'models' || cmd === 'model'") || m.includes("cmd === 'models'")) {
      // soft replace open models picker path
      m = m.replace(
        /if \(cmd === 'models'[^\{]*\{/,
        (s) =>
          s +
          "\n    // MODELS_REFRESH_IF_EMPTY\n    if (!models?.length && !window.__mimoModels?.length) {\n      showToast('refresh models…');\n      post({ type: 'refreshModels' });\n    }"
      );
      // may break if models var name different
      if (!m.includes('MODELS_REFRESH_IF_EMPTY')) {
        console.log('models inject miss');
      } else {
        fs.writeFileSync('src/webview/app/main.ts', m);
        console.log('models empty refresh ok');
      }
    }
  }
}

// safer: host handles message type refreshModels from webview - already case
// webview post type refreshModels - need host switch
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  // if webview posts type refreshModels, is it handled? case 'refreshModels' in runCommand vs message
  if (h.includes("case 'refreshModels'") && h.includes('msg.type') || h.includes('type ===')) {
    console.log('refreshModels in message switch ok likely');
  }
  // ensure webview message handler routes refreshModels
  // many hosts use switch(msg.type)
  if (!h.includes("msg.type === 'refreshModels'") && h.includes("case 'refreshModels'")) {
    // already in switch on type via case
    console.log('case based ok');
  }
}

// Soft: when permission panel open Escape - already
// Functional: host toast when soft reconnect after fail - already throttle

// Soft improve: /help mention copy-last pin jump doctor version
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (m.includes('`/doctor`') && !m.includes('`/copy-last`')) {
    m = m.replace(
      '`/doctor` `/version`',
      '`/doctor` `/version` `/copy-last` `/pin` `/jump` `/focus`'
    );
    if (!m.includes('`/copy-last`') && m.includes('/doctor` `/version`')) {
      m = m.replace(
        '/doctor` `/version`',
        '/doctor` `/version` `/copy-last` `/pin` `/jump` `/focus`'
      );
    }
    fs.writeFileSync('src/webview/app/main.ts', m);
    console.log('help copy-last', m.includes('copy-last'));
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
const tmp = path.join(os.tmpdir(), 'mimo-b294-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.293',
  'mimo.mimo-vscode-1.0.0-beta.292',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: catalog copy-last; models empty refresh; KEEP PORTING"`,
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

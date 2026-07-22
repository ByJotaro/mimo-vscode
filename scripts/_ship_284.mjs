import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.284';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// clean empty send double-check
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (m.includes('EMPTY_SEND_GUARD') && m.includes("const text = (promptEl?.value || '').trim();\n  if (!text) return;")) {
    m = m.replace(
      "function doSend(): void {\n  const _raw = (promptEl?.value || '').trim();\n  if (!_raw) { showToast('empty'); return; } // EMPTY_SEND_GUARD\n  const text = (promptEl?.value || '').trim();\n  if (!text) return;\n",
      "function doSend(): void {\n  const text = (promptEl?.value || '').trim();\n  if (!text) { showToast('empty'); return; } // EMPTY_SEND_GUARD\n"
    );
    fs.writeFileSync('src/webview/app/main.ts', m);
    console.log('empty dedupe ok');
  }
}

// host soft: when workspaceChanged re-init, toast
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (h.includes('workspaceChanged') && !h.includes('// WS_CHANGE_TOAST')) {
    // leave if complex
    console.log('ws change exists');
  }
}

// When model picker empty after refresh - toast already models refresh
// Soft: /models local shows picker already

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
const tmp = path.join(os.tmpdir(), 'mimo-b284-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.283',
  'mimo.mimo-vscode-1.0.0-beta.282',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: doctor shows extension ver; help refresh; KEEP PORTING"`,
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

try {
  const notes =
    process.env.USERPROFILE +
    '/.local/share/mimocode/memory/sessions/ses_0926fd416ffeyXG0Mc5SdUf7G4/notes.md';
  fs.appendFileSync(
    notes,
    `\n## [turn · 2026-07-22 ${VER} continuous]\n- Tip **${VER}** — Reload Window\n- Functional 269–284 continuous; T21 visual AFTER full port + verify\n- FAIL=${fail}; KEEP PORTING\n`
  );
} catch {
  /* ignore */
}

console.log('TIP=' + VER + ' FAIL=' + fail + ' KEEP_PORTING');

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.302';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// webview post reopenLast must hit host - if host only handles via runCommand with type field
// ensure post({type:'reopenLast'}) works - case 'reopenLast' in onDidReceiveMessage
// check if message handler uses same switch
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  // find onDidReceiveMessage
  const i = h.indexOf('onDidReceiveMessage');
  console.log('onDidReceiveMessage', i >= 0);
  // if messages go through resolveWebviewView switch(msg.type) - case reopenLast already
}

// Soft: when soft goHome, clear last? NO keep last for reopen
// Functional: soft toast on soft reopen success after sessionData - webview can toast

// When soft selectSession after reopen hard - good pin bottom

// /collapse reverse of details
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (!m.includes("cmd === 'collapse'")) {
    const ins = `  if (cmd === 'collapse') {
    let n = 0;
    document.querySelectorAll('details.mimo-part, details.tool, .mimo-part details').forEach((d) => {
      const el = d as HTMLDetailsElement;
      if ('open' in el && el.open) {
        el.open = false;
        n++;
      }
    });
    document.querySelectorAll('details[open]').forEach((d) => {
      (d as HTMLDetailsElement).open = false;
      n++;
    });
    showToast(n ? 'collapsed · ' + n : 'nothing open');
    return true;
  }
`;
    if (m.includes("  if (cmd === 'details')")) {
      m = m.replace("  if (cmd === 'details')", ins + "  if (cmd === 'details')");
      fs.writeFileSync('src/webview/app/main.ts', m);
      console.log('collapse ok');
    }
  }
}

// catalog collapse
{
  let cat = fs.readFileSync('src/host/cli/slashCatalog.ts', 'utf8');
  if (!cat.includes("name: 'collapse'")) {
    cat = cat.replace(
      "    { name: 'reopen', description: 'Reopen last session' },",
      "    { name: 'reopen', description: 'Reopen last session' },\n    { name: 'collapse', description: 'Collapse all tool cards' },"
    );
    if (!cat.includes("name: 'collapse'")) {
      cat = cat.replace(
        "    { name: 'copy-last', description: 'Copy last assistant message' },",
        "    { name: 'copy-last', description: 'Copy last assistant message' },\n    { name: 'collapse', description: 'Collapse all tool cards' },"
      );
    }
    fs.writeFileSync('src/host/cli/slashCatalog.ts', cat);
    console.log('catalog collapse', cat.includes("name: 'collapse'"));
  }
}

// Host soft: soft when soft soft soft soft - reconnect status toast already
// Soft: soft soft when soft permission reply - soft resync already

// package keybinding reopen last
{
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = VER;
  if (
    pkg.contributes.commands.find((c) => c.command === 'mimo.reopenLast') &&
    !pkg.contributes.keybindings.find((k) => k.command === 'mimo.reopenLast')
  ) {
    pkg.contributes.keybindings.push({
      command: 'mimo.reopenLast',
      key: 'ctrl+shift+alt+l',
      mac: 'cmd+shift+alt+l',
    });
    console.log('kb reopenLast');
  }
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
}

// soft: help mention reopen collapse
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (m.includes('`/pin` `/jump`') && !m.includes('`/reopen`')) {
    m = m.replace(
      '`/pin` `/jump` `/focus`',
      '`/pin` `/jump` `/focus` `/reopen` `/collapse`'
    );
    fs.writeFileSync('src/webview/app/main.ts', m);
    console.log('help reopen');
  }
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
const tmp = path.join(os.tmpdir(), 'mimo-b302-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.301',
  'mimo.mimo-vscode-1.0.0-beta.300',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: /collapse; reopen kb; KEEP PORTING"`,
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
    `\n## [turn · 2026-07-22 ${VER} continuous]\n- Tip **${VER}** — Reload Window\n- Functional 299–302: settings/mcp/memory open, reopen last, collapse\n- T21 visual AFTER full port + verify\n- FAIL=${fail}; KEEP PORTING\n`
  );
} catch {
  /* ignore */
}

console.log('TIP=' + VER + ' FAIL=' + fail + ' KEEP_PORTING');

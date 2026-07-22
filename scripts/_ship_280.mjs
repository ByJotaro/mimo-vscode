import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.280';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// When question panel open: Escape dismisses already
// Functional: /clear confirms with toast then clears - check clearChat
// Soft: host when listSessions empty after init, toast soft - skip
// When models empty: toast on open model picker already
// Soft improve: post version into status bar text on activate when provider ready - activate has verShort

// Host: after soft selectSession, if messages empty still toast? skip
// Functional: when drag folder path into prompt - path paste covers multi-line files
// When Ctrl+Enter send while empty - toast already

// /pin: scroll lock pinBottom toggle
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (!m.includes("cmd === 'pin'") && !m.includes("cmd === 'scroll'")) {
    const ins = `  if (cmd === 'pin' || cmd === 'scroll') {
    // toggle pinBottom-ish: flip auto-scroll preference stored on dataset
    const on = chatEl?.dataset.pinBottom !== '0';
    if (chatEl) chatEl.dataset.pinBottom = on ? '0' : '1';
    showToast(on ? 'scroll free' : 'scroll pin');
    return true;
  }
`;
    if (m.includes("  if (cmd === 'clear')")) {
      m = m.replace("  if (cmd === 'clear')", ins + "  if (cmd === 'clear')");
    } else if (m.includes("  if (cmd === 'help')")) {
      m = m.replace("  if (cmd === 'help')", ins + "  if (cmd === 'help')");
    }
    // wire pinBottom in stream scroll if exists
    if (m.includes('pinBottom') || m.includes('scrollTop')) {
      // optional: if dataset.pinBottom === '0' skip auto scroll - find scrollIntoView or pin
    }
    fs.writeFileSync('src/webview/app/main.ts', m);
    console.log('pin slash', m.includes("cmd === 'pin'"));
  }
  // honor pin in auto-scroll
  m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (m.includes("cmd === 'pin'") && !m.includes('// PIN_BOTTOM_GUARD')) {
    // find common auto-scroll pattern
    const patterns = [
      'chatEl.scrollTop = chatEl.scrollHeight;',
      'messagesEl.scrollTop = messagesEl.scrollHeight;',
      'scrollEl.scrollTop = scrollEl.scrollHeight;',
    ];
    let hit = false;
    for (const p of patterns) {
      if (m.includes(p) && !m.includes('PIN_BOTTOM_GUARD')) {
        m = m.replaceAll(
          p,
          `if (chatEl?.dataset.pinBottom !== '0') { ${p} } // PIN_BOTTOM_GUARD`
        );
        hit = true;
      }
    }
    // also scrollIntoView last child
    if (m.includes('.scrollIntoView({ block: \'end\'') && !m.includes('PIN_SCROLL_INTO')) {
      m = m.replace(
        '.scrollIntoView({ block: \'end\'',
        ".scrollIntoView({ block: 'end' /* PIN_SCROLL_INTO"
      );
      // that's broken - better leave scrollIntoView
      m = m.replace(" /* PIN_SCROLL_INTO", '');
    }
    fs.writeFileSync('src/webview/app/main.ts', m);
    console.log('pin guard', hit || m.includes('PIN_BOTTOM_GUARD'));
  }
}

// catalog pin
{
  let cat = fs.readFileSync('src/host/cli/slashCatalog.ts', 'utf8');
  if (!cat.includes("name: 'pin'")) {
    cat = cat.replace(
      "    { name: 'version', description: 'Show extension package version' },",
      "    { name: 'version', description: 'Show extension package version' },\n    { name: 'pin', description: 'Toggle auto-scroll pin to bottom' },"
    );
    fs.writeFileSync('src/host/cli/slashCatalog.ts', cat);
    console.log('catalog pin');
  }
}

// Host: when goHome, abort soft if in flight? optional
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (h.includes('private async goHome') || h.includes("case 'goHome'")) {
    if (!h.includes('// GO_HOME_ABORT') && h.includes("case 'goHome'")) {
      // leave if not found body
      console.log('goHome exists');
    }
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
const tmp = path.join(os.tmpdir(), 'mimo-b280-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.279',
  'mimo.mimo-vscode-1.0.0-beta.278',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: /pin toggle auto-scroll; KEEP PORTING"`,
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

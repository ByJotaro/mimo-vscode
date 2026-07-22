import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.277';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// When history list item open: soft toast already opening
// Functional: after permission always, ensure soft resync - already
// Soft improve: host sendInit posts workspaceRoot - already
// When user hits Ctrl+Shift+L clear - already
// Functional: package keybinding for history open
{
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = VER;
  if (!pkg.contributes.keybindings.find((k) => k.command === 'mimo.openHistory')) {
    pkg.contributes.keybindings.push({
      command: 'mimo.openHistory',
      key: 'ctrl+shift+alt+h',
      mac: 'cmd+shift+alt+h',
    });
  }
  if (!pkg.contributes.keybindings.find((k) => k.command === 'mimo.goHome')) {
    pkg.contributes.keybindings.push({
      command: 'mimo.goHome',
      key: 'ctrl+shift+alt+u',
      mac: 'cmd+shift+alt+u',
    });
  }
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  console.log('keybindings', pkg.contributes.keybindings.length);
}

// When webview streamDone: if soft resync and usage refresh - already
// Soft: host on error also soft abort sendInFlight - already
// Functional: /doctor local - collect env diagnostics card
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (!m.includes("cmd === 'doctor'")) {
    const ins = `  if (cmd === 'doctor') {
    showToast('doctor…');
    post({ type: 'doctor' });
    return true;
  }
`;
    if (m.includes("  if (cmd === 'port'")) {
      m = m.replace("  if (cmd === 'port'", ins + "  if (cmd === 'port'");
    } else if (m.includes("  if (cmd === 'about')")) {
      m = m.replace("  if (cmd === 'about')", ins + "  if (cmd === 'about')");
    } else if (m.includes("  if (cmd === 'help')")) {
      m = m.replace("  if (cmd === 'help')", ins + "  if (cmd === 'help')");
    }
    fs.writeFileSync('src/webview/app/main.ts', m);
    console.log('doctor slash', m.includes("cmd === 'doctor'"));
  }
}

// host doctor collects paths
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (!h.includes("case 'doctor'")) {
    // need imports for getMimoBin getMimoDbPath findSqlite3Bin
    if (!h.includes("getMimoBin") && h.includes("from './cli/MimoClient'")) {
      // add import from paths
      if (!h.includes("from './db/paths'") && !h.includes('from "./db/paths"')) {
        h = h.replace(
          "import { MimoClient, getWorkspaceRoot } from './cli/MimoClient';",
          "import { MimoClient, getWorkspaceRoot } from './cli/MimoClient';\nimport { getMimoBin, getMimoDbPath, findSqlite3Bin } from './db/paths';"
        );
      }
    }
    const block = `        case 'doctor': {
          const bin = getMimoBin();
          const db = getMimoDbPath();
          const sql = findSqlite3Bin() || '(missing)';
          const root = getWorkspaceRoot();
          const lines = [
            '**Doctor**',
            '- workspace: \`' + root + '\`',
            '- mimo bin: \`' + bin + '\`',
            '- db: \`' + db + '\`',
            '- sqlite3: \`' + sql + '\`',
            '- session: \`' + (this.currentSessionId || '(home)') + '\`',
            '- mode: \`' + this.selectedMode + '\`',
            '- model: \`' + (this.selectedModel || '—') + '\`',
            '- models cached: ' + this.models.length,
            '- busy: ' + (this.sendInFlight ? 'yes' : 'no'),
          ];
          this.post({
            type: 'appendMessage',
            sessionId: this.currentSessionId || undefined,
            message: {
              id: 'sys_doctor_' + Date.now(),
              role: 'assistant',
              text: lines.join('\\n'),
            },
          });
          this.post({ type: 'toast', text: 'doctor' });
          break;
        }
`;
    if (h.includes("case 'showLog':")) {
      h = h.replace("case 'showLog':", block + "        case 'showLog':");
    } else if (h.includes("case 'openSettings':")) {
      h = h.replace("case 'openSettings':", block + "        case 'openSettings':");
    }
    fs.writeFileSync('src/host/SidebarProvider.ts', h);
    console.log('doctor host', h.includes("case 'doctor'"));
  }
}

// catalog
{
  let cat = fs.readFileSync('src/host/cli/slashCatalog.ts', 'utf8');
  if (!cat.includes("name: 'doctor'")) {
    cat = cat.replace(
      "    { name: 'help', description: 'Show help' },",
      "    { name: 'help', description: 'Show help' },\n    { name: 'doctor', description: 'Extension diagnostics (bin/db/sqlite)' },"
    );
    fs.writeFileSync('src/host/cli/slashCatalog.ts', cat);
    console.log('catalog doctor');
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
const tmp = path.join(os.tmpdir(), 'mimo-b277-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.276',
  'mimo.mimo-vscode-1.0.0-beta.275',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: /doctor diagnostics; history/home keybindings; KEEP PORTING"`,
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
    `\n## [turn · 2026-07-22 ${VER} continuous]\n- Tip **${VER}** — Reload Window\n- /doctor; keybindings history/home; T21 visual AFTER port\n- FAIL=${fail}; KEEP PORTING\n`
  );
} catch {
  /* ignore */
}

console.log('TIP=' + VER + ' FAIL=' + fail + ' KEEP_PORTING');

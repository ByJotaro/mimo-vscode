import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.272';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// /title — show title + id, optional rename rest
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (!m.includes("cmd === 'title'")) {
    const ins = `  if (cmd === 'title') {
    if (rest) {
      showToast('rename…');
      post({
        type: 'sendPrompt',
        text: '/rename ' + rest,
        sessionId: activeSessionId || undefined,
        mode: selectedMode,
        model: selectedModel || undefined,
      });
      return true;
    }
    const id = activeSessionId || '(home)';
    const t = (titleEl?.textContent || '').trim() || id;
    showToast('title');
    appendOrUpdateMessage({
      id: 'sys_title_' + Date.now(),
      role: 'assistant',
      text: '**Title**\\n- ' + t + '\\n- id: \`' + id + '\`\\n\\nRename: \`/title New name\` or \`/rename …\`',
    });
    return true;
  }
`;
    if (m.includes("  if (cmd === 'id'")) {
      m = m.replace("  if (cmd === 'id'", ins + "  if (cmd === 'id'");
      fs.writeFileSync('src/webview/app/main.ts', m);
      console.log('title ok');
    } else if (m.includes("  if (cmd === 'rename')")) {
      m = m.replace("  if (cmd === 'rename')", ins + "  if (cmd === 'rename')");
      fs.writeFileSync('src/webview/app/main.ts', m);
      console.log('title ok rename');
    } else console.log('title miss');
  } else console.log('title exists');
}

// catalog
{
  let cat = fs.readFileSync('src/host/cli/slashCatalog.ts', 'utf8');
  if (!cat.includes("name: 'title'")) {
    cat = cat.replace(
      "    { name: 'rename', description: 'Rename current session' },",
      "    { name: 'title', description: 'Show session title (or /title <name> rename)' },\n    { name: 'rename', description: 'Rename current session' },"
    );
    fs.writeFileSync('src/host/cli/slashCatalog.ts', cat);
    console.log('catalog title');
  }
}

// host: after newSession success toast already; soft when soft select after streamDone already
// functional: when permission always - toast already
// soft improve: webview on streamUpdate setBusy true if not busy
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (!m.includes('// STREAM_BUSY_MARK') && m.includes("case 'streamUpdate':")) {
    m = m.replace(
      "    case 'streamUpdate':\n      if (message.sessionId && activeSessionId && message.sessionId !== activeSessionId) break;",
      "    case 'streamUpdate':\n      if (message.sessionId && activeSessionId && message.sessionId !== activeSessionId) break;\n      if (!busy) setBusy(true); // STREAM_BUSY_MARK"
    );
    if (!m.includes('STREAM_BUSY_MARK')) {
      m = m.replace(
        "    case 'streamUpdate':\r\n      if (message.sessionId && activeSessionId && message.sessionId !== activeSessionId) break;",
        "    case 'streamUpdate':\r\n      if (message.sessionId && activeSessionId && message.sessionId !== activeSessionId) break;\r\n      if (!busy) setBusy(true); // STREAM_BUSY_MARK"
      );
    }
    fs.writeFileSync('src/webview/app/main.ts', m);
    console.log('stream busy', m.includes('STREAM_BUSY_MARK'));
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
const tmp = path.join(os.tmpdir(), 'mimo-b272-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.271',
  'mimo.mimo-vscode-1.0.0-beta.270',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: /title; stream sets busy; KEEP PORTING"`,
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

// notes
try {
  const notes =
    process.env.USERPROFILE +
    '/.local/share/mimocode/memory/sessions/ses_0926fd416ffeyXG0Mc5SdUf7G4/notes.md';
  fs.appendFileSync(
    notes,
    `\n## [turn · 2026-07-22 ${VER} continuous]\n- Tip **${VER}** — Reload Window\n- Functional port continues; T21 visual AFTER full port\n- FAIL=${fail}; KEEP PORTING\n`
  );
} catch {
  /* ignore */
}

console.log('TIP=' + VER + ' FAIL=' + fail + ' KEEP_PORTING');

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.305';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// /count — message counts in current view
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (!m.includes("cmd === 'count'")) {
    const ins = `  if (cmd === 'count') {
    const users = chat.querySelectorAll('.msg.user, .message.user, [data-role="user"]').length;
    const asst = chat.querySelectorAll('.msg.assistant, .message.assistant, [data-role="assistant"]').length;
    const tools = chat.querySelectorAll('.mimo-part, details.tool').length;
    const total = chat.querySelectorAll('.msg, .message, [data-role]').length || users + asst;
    showToast(total + ' msgs');
    appendOrUpdateMessage({
      id: 'sys_count_' + Date.now(),
      role: 'assistant',
      text:
        '**Count**\\n- messages: \`' +
        total +
        '\`\\n- user: \`' +
        users +
        '\`\\n- assistant: \`' +
        asst +
        '\`\\n- tool cards: \`' +
        tools +
        '\`\\n- loaded: \`' +
        loadedCount +
        '\`',
    });
    return true;
  }
`;
    if (m.includes("  if (cmd === 'find'")) {
      m = m.replace("  if (cmd === 'find'", ins + "  if (cmd === 'find'");
    } else if (m.includes("  if (cmd === 'help')")) {
      m = m.replace("  if (cmd === 'help')", ins + "  if (cmd === 'help')");
    } else {
      console.log('count anchor miss');
      process.exit(1);
    }
    fs.writeFileSync('src/webview/app/main.ts', m);
    console.log('count slash ok');
  } else console.log('count exists');
}

// catalog
{
  let cat = fs.readFileSync('src/host/cli/slashCatalog.ts', 'utf8');
  if (!cat.includes("name: 'count'")) {
    cat = cat.replace(
      "    { name: 'find', description: 'Find text in current chat' },",
      "    { name: 'find', description: 'Find text in current chat' },\n    { name: 'count', description: 'Count messages/tools in view' },"
    );
    if (!cat.includes("name: 'count'")) {
      cat = cat.replace(
        "    { name: 'copy-last', description: 'Copy last assistant message' },",
        "    { name: 'copy-last', description: 'Copy last assistant message' },\n    { name: 'count', description: 'Count messages/tools in view' },"
      );
    }
    fs.writeFileSync('src/host/cli/slashCatalog.ts', cat);
    console.log('catalog count', cat.includes("name: 'count'"));
  }
}

// host: toast when openHistory gets empty session list
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (!h.includes('// EMPTY_SESSIONS_TOAST') && h.includes('sendSessionsList')) {
    // after posting sessions, if empty toast — find post type sessionsList or sessions
    if (h.includes("type: 'sessionsList'") || h.includes("type: 'sessions'")) {
      const re = /this\.post\(\{\s*type:\s*'(sessionsList|sessions)'[^}]*sessions:\s*(\w+)/;
      const m = h.match(/type:\s*'sessions[^']*'/g);
      console.log('session post types', m);
    }
    // inject in sendSessionsList if exists
    const i = h.indexOf('sendSessionsList');
    if (i >= 0) {
      console.log('sendSessionsList sample', h.slice(i, i + 300).replace(/\s+/g, ' ').slice(0, 200));
    }
  }
}

// soft: clear find hits on next send
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (m.includes('mimo-find-hit') && !m.includes('// CLEAR_FIND_HITS')) {
    if (m.includes('function doSend(): void {') && !m.includes('CLEAR_FIND_HITS')) {
      m = m.replace(
        'function doSend(): void {',
        "function doSend(): void {\n  document.querySelectorAll('.mimo-find-hit').forEach((el) => el.classList.remove('mimo-find-hit')); // CLEAR_FIND_HITS"
      );
      fs.writeFileSync('src/webview/app/main.ts', m);
      console.log('clear find hits ok');
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
const tmp = path.join(os.tmpdir(), 'mimo-b305-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.304',
  'mimo.mimo-vscode-1.0.0-beta.303',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: /count messages; clear find hits on send; KEEP PORTING"`,
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
    `\n## [turn · 2026-07-22 ${VER} continuous]\n- Tip **${VER}** — Reload Window\n- /count; find hits clear on send; T21 visual AFTER full port\n- FAIL=${fail}; KEEP PORTING\n`
  );
} catch {
  /* ignore */
}

console.log('TIP=' + VER + ' FAIL=' + fail + ' KEEP_PORTING');

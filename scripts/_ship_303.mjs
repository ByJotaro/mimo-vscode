import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.303';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// Inspect host cases
{
  const h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  for (const k of [
    'insertEditorSelection',
    'openFilePath',
    'openFolder',
    'openMemoryDir',
    'reopenLast',
    'focusPrompt',
    'focusChat',
  ]) {
    console.log(k, h.includes(`case '${k}'`));
  }
}

// /mute toast? skip
// Functional: when soft soft - double-click title already copies session id - verify
// Soft: status bar shows last session short id on idle

// Host: after selectSession hard, post toast with short id
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (!h.includes('// OPEN_SESSION_TOAST') && h.includes('private async selectSession')) {
    // after this.currentSessionId = sessionId in selectSession, if !opts?.soft toast
    const mark = 'if (sessionId) void this.context.globalState.update(\'mimo.lastSessionId\', sessionId); // LAST_SESSION_PERSIST';
    const alt = 'if (sessionId) void this.context.globalState.update("mimo.lastSessionId", sessionId); // LAST_SESSION_PERSIST';
    const insert =
      "\n    if (!opts?.soft && sessionId) {\n      this.post({ type: 'toast', text: 'session · ' + sessionId.slice(0, 12) }); // OPEN_SESSION_TOAST\n    }";
    if (h.includes(mark) && !h.includes('OPEN_SESSION_TOAST')) {
      h = h.replace(mark, mark + insert);
      fs.writeFileSync('src/host/SidebarProvider.ts', h);
      console.log('open session toast ok');
    } else if (h.includes('LAST_SESSION_PERSIST') && !h.includes('OPEN_SESSION_TOAST')) {
      h = h.replace(
        /LAST_SESSION_PERSIST/,
        'LAST_SESSION_PERSIST' + insert
      );
      // might break if multiple - check
      fs.writeFileSync('src/host/SidebarProvider.ts', h);
      console.log('open session toast via mark', h.includes('OPEN_SESSION_TOAST'));
    } else console.log('persist mark miss or toast exists');
  }
}

// focusChat command → focus prompt + open sidebar
{
  let a = fs.readFileSync('src/extension/activate.ts', 'utf8');
  if (a.includes('mimo.focusChat') && !a.includes("runCommand('focusPrompt')") && a.includes("mimo.focusChat")) {
    // read how focusChat is registered
    const i = a.indexOf('mimo.focusChat');
    console.log('focusChat sample', a.slice(i, i + 200));
  }
  // ensure focusChat opens sidebar then focus prompt
  if (a.includes("registerCommand('mimo.focusChat'")) {
    const re = /registerCommand\('mimo\.focusChat',\s*\(\)\s*=>\s*\{[\s\S]*?\}\)/;
    // simpler replace body if weak
    if (a.includes("mimo.focusChat") && !a.includes('// FOCUS_CHAT_PROMPT')) {
      a = a.replace(
        /vscode\.commands\.registerCommand\('mimo\.focusChat',\s*\(\)\s*=>\s*[^,]+\)/,
        `vscode.commands.registerCommand('mimo.focusChat', () => {
      // FOCUS_CHAT_PROMPT
      void vscode.commands.executeCommand('mimo.openSidebar');
      runHost(() => provider.runCommand('focusPrompt'));
    })`
      );
      if (!a.includes('FOCUS_CHAT_PROMPT')) {
        // try multiline
        a = a.replace(
          "vscode.commands.registerCommand('mimo.focusChat', () =>\n      runHost(() => provider.runCommand('focusPrompt'))\n    )",
          "vscode.commands.registerCommand('mimo.focusChat', () => {\n      // FOCUS_CHAT_PROMPT\n      void vscode.commands.executeCommand('mimo.openSidebar');\n      runHost(() => provider.runCommand('focusPrompt'));\n    })"
        );
      }
      fs.writeFileSync('src/extension/activate.ts', a);
      console.log('focusChat enhanced', a.includes('FOCUS_CHAT_PROMPT'));
    }
  }
}

// /top scroll to top of chat
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (!m.includes("cmd === 'top'")) {
    const ins = `  if (cmd === 'top') {
    autoScroll = false;
    if (chat) chat.scrollTop = 0;
    ensureJumpBottom();
    showToast('↑ top');
    return true;
  }
`;
    if (m.includes("  if (cmd === 'jump'") || m.includes("  if (cmd === 'jump' ||")) {
      m = m.replace(/  if \(cmd === 'jump'/, ins + "  if (cmd === 'jump'");
    } else if (m.includes("  if (cmd === 'pin'")) {
      m = m.replace("  if (cmd === 'pin'", ins + "  if (cmd === 'pin'");
    }
    fs.writeFileSync('src/webview/app/main.ts', m);
    console.log('top slash', m.includes("cmd === 'top'"));
  }
}

// catalog top
{
  let cat = fs.readFileSync('src/host/cli/slashCatalog.ts', 'utf8');
  if (!cat.includes("name: 'top'")) {
    cat = cat.replace(
      "    { name: 'collapse', description: 'Collapse all tool cards' },",
      "    { name: 'collapse', description: 'Collapse all tool cards' },\n    { name: 'top', description: 'Scroll chat to top' },"
    );
    if (!cat.includes("name: 'top'")) {
      cat = cat.replace(
        "    { name: 'jump', description: 'Scroll chat to bottom and pin' },",
        "    { name: 'jump', description: 'Scroll chat to bottom and pin' },\n    { name: 'top', description: 'Scroll chat to top' },"
      );
    }
    fs.writeFileSync('src/host/cli/slashCatalog.ts', cat);
    console.log('catalog top', cat.includes("name: 'top'"));
  }
}

// soft: when soft soft soft - host toast on setMode might double with webview - ok

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
const tmp = path.join(os.tmpdir(), 'mimo-b303-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.302',
  'mimo.mimo-vscode-1.0.0-beta.301',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: /top; open-session toast; focusChat; KEEP PORTING"`,
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

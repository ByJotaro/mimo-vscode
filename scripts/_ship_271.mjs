import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.271';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// /id — copy current session id
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (!m.includes("cmd === 'id'") && !m.includes("cmd === 'session'")) {
    const ins = `  if (cmd === 'id' || cmd === 'session') {
    const id = activeSessionId || '';
    if (!id) {
      showToast('no session');
      return true;
    }
    if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(id);
    showToast('session id');
    appendOrUpdateMessage({
      id: 'sys_sid_' + Date.now(),
      role: 'assistant',
      text: '**Session**\\n- \`' + id + '\`',
    });
    return true;
  }
`;
    if (m.includes("  if (cmd === 'cwd'")) {
      m = m.replace("  if (cmd === 'cwd'", ins + "  if (cmd === 'cwd'");
      fs.writeFileSync('src/webview/app/main.ts', m);
      console.log('id slash ok');
    } else if (m.includes("  if (cmd === 'open')")) {
      m = m.replace("  if (cmd === 'open')", ins + "  if (cmd === 'open')");
      fs.writeFileSync('src/webview/app/main.ts', m);
      console.log('id slash ok open');
    } else console.log('id slash miss');
  } else console.log('id exists');
}

// catalog
{
  let cat = fs.readFileSync('src/host/cli/slashCatalog.ts', 'utf8');
  if (!cat.includes("name: 'id'")) {
    cat = cat.replace(
      "    { name: 'fork', description: 'Fork current session' },",
      "    { name: 'fork', description: 'Fork current session' },\n    { name: 'id', description: 'Copy current session id' },\n    { name: 'session', description: 'Show / copy current session id' },"
    );
    fs.writeFileSync('src/host/cli/slashCatalog.ts', cat);
    console.log('catalog id ok');
  }
}

// host: toast when fork fails already; when createSession - soft
// soft: when goHome, clear usage dataset via init - webview already
// functional: package command copy session id
{
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = VER;
  if (!pkg.contributes.commands.find((c) => c.command === 'mimo.copySessionId')) {
    pkg.contributes.commands.push({
      command: 'mimo.copySessionId',
      title: 'MiMo Code: Copy Session Id',
    });
    pkg.activationEvents.push('onCommand:mimo.copySessionId');
  }
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
}

// activate copy session id -> post to webview
{
  let a = fs.readFileSync('src/extension/activate.ts', 'utf8');
  if (!a.includes('mimo.copySessionId')) {
    a = a.replace(
      "vscode.commands.registerCommand('mimo.redo', () =>\n      runHost(() => provider.runCommand('redoLast'))\n    )",
      "vscode.commands.registerCommand('mimo.redo', () =>\n      runHost(() => provider.runCommand('redoLast'))\n    ),\n    vscode.commands.registerCommand('mimo.copySessionId', () =>\n      runHost(() => provider.runCommand('copySessionId'))\n    )"
    );
    // try crlf
    if (!a.includes('mimo.copySessionId')) {
      a = a.replace(
        "vscode.commands.registerCommand('mimo.redo', () =>\r\n      runHost(() => provider.runCommand('redoLast'))\r\n    )",
        "vscode.commands.registerCommand('mimo.redo', () =>\r\n      runHost(() => provider.runCommand('redoLast'))\r\n    ),\r\n    vscode.commands.registerCommand('mimo.copySessionId', () =>\r\n      runHost(() => provider.runCommand('copySessionId'))\r\n    )"
      );
    }
    fs.writeFileSync('src/extension/activate.ts', a);
    console.log('activate copy', a.includes('mimo.copySessionId'));
  }
}

// host copySessionId posts to webview
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (!h.includes("case 'copySessionId'")) {
    h = h.replace(
      "case 'requestExport':",
      "case 'copySessionId':\n          this.post({ type: 'copySessionId' });\n          break;\n        case 'requestExport':"
    );
    if (!h.includes("case 'copySessionId'")) {
      h = h.replace(
        "case 'requestExport':",
        "case 'copySessionId':\r\n          this.post({ type: 'copySessionId' });\r\n          break;\r\n        case 'requestExport':"
      );
    }
    fs.writeFileSync('src/host/SidebarProvider.ts', h);
    console.log('host copy', h.includes("case 'copySessionId'"));
  }
}

// webview copySessionId
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (!m.includes("case 'copySessionId'")) {
    m = m.replace(
      "    case 'requestExport':",
      "    case 'copySessionId':\n      handleLocalSlash('/id');\n      break;\n    case 'requestExport':"
    );
    if (!m.includes("case 'copySessionId'")) {
      m = m.replace(
        "    case 'focusPrompt':",
        "    case 'copySessionId':\n      handleLocalSlash('/id');\n      break;\n    case 'focusPrompt':"
      );
    }
    fs.writeFileSync('src/webview/app/main.ts', m);
    console.log('wv copy', m.includes("case 'copySessionId'"));
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
const tmp = path.join(os.tmpdir(), 'mimo-b271-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.270',
  'mimo.mimo-vscode-1.0.0-beta.269',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: /id session copy + palette; KEEP PORTING"`,
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

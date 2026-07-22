import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.282';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// /jump = scroll to bottom + pin
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (!m.includes("cmd === 'jump'")) {
    const ins = `  if (cmd === 'jump' || cmd === 'bottom') {
    autoScroll = true;
    scrollToBottom(chat, true);
    ensureJumpBottom();
    showToast('↓ bottom');
    return true;
  }
`;
    if (m.includes("  if (cmd === 'pin'")) {
      m = m.replace("  if (cmd === 'pin'", ins + "  if (cmd === 'pin'");
      fs.writeFileSync('src/webview/app/main.ts', m);
      console.log('jump ok');
    }
  }
}

// catalog
{
  let cat = fs.readFileSync('src/host/cli/slashCatalog.ts', 'utf8');
  if (!cat.includes("name: 'jump'")) {
    cat = cat.replace(
      "    { name: 'focus', description: 'Focus the prompt input' },",
      "    { name: 'focus', description: 'Focus the prompt input' },\n    { name: 'jump', description: 'Scroll chat to bottom and pin' },\n    { name: 'bottom', description: 'Scroll chat to bottom and pin' },"
    );
    fs.writeFileSync('src/host/cli/slashCatalog.ts', cat);
    console.log('catalog jump');
  }
}

// Host: soft toast when soft select after done already
// When sendPrompt empty - host rejects?
// Soft: on streamError also clear sendInFlight - check
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (!h.includes('// STREAM_ERR_BUSY') && h.includes("type: 'error'")) {
    // find post error after send
    const i = h.indexOf("type: 'error'");
    console.log('error posts', (h.match(/type: 'error'/g) || []).length);
  }
}

// /whoami alias doctor lite - skip
// package: keybinding focus prompt already? focusPrompt command
{
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = VER;
  if (!pkg.contributes.keybindings.find((k) => k.command === 'mimo.focusPrompt')) {
    // check if command exists
    if (pkg.contributes.commands.find((c) => c.command === 'mimo.focusPrompt')) {
      pkg.contributes.keybindings.push({
        command: 'mimo.focusPrompt',
        key: 'ctrl+shift+alt+p',
        mac: 'cmd+shift+alt+p',
      });
      console.log('kb focusPrompt');
    } else {
      pkg.contributes.commands.push({
        command: 'mimo.focusPrompt',
        title: 'MiMo Code: Focus Prompt',
      });
      pkg.activationEvents.push('onCommand:mimo.focusPrompt');
      pkg.contributes.keybindings.push({
        command: 'mimo.focusPrompt',
        key: 'ctrl+shift+alt+p',
        mac: 'cmd+shift+alt+p',
      });
      console.log('cmd+kb focusPrompt');
    }
  }
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
}

// activate focusPrompt
{
  let a = fs.readFileSync('src/extension/activate.ts', 'utf8');
  if (!a.includes('mimo.focusPrompt')) {
    a = a.replace(
      "vscode.commands.registerCommand('mimo.doctor', () =>\n      runHost(() => provider.runCommand('doctor'))\n    )",
      "vscode.commands.registerCommand('mimo.doctor', () =>\n      runHost(() => provider.runCommand('doctor'))\n    ),\n    vscode.commands.registerCommand('mimo.focusPrompt', () =>\n      runHost(() => provider.runCommand('focusPrompt'))\n    )"
    );
    if (!a.includes('mimo.focusPrompt')) {
      a = a.replace(
        "vscode.commands.registerCommand('mimo.openSidebar'",
        "vscode.commands.registerCommand('mimo.focusPrompt', () =>\n      runHost(() => provider.runCommand('focusPrompt'))\n    ),\n    vscode.commands.registerCommand('mimo.openSidebar'"
      );
    }
    fs.writeFileSync('src/extension/activate.ts', a);
    console.log('activate focus', a.includes('mimo.focusPrompt'));
  }
}

// host focusPrompt -> post to webview
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (!h.includes("case 'focusPrompt'")) {
    h = h.replace(
      "case 'doctor':",
      "case 'focusPrompt':\n          this.post({ type: 'focusPrompt' });\n          break;\n        case 'doctor':"
    );
    if (!h.includes("case 'focusPrompt'")) {
      h = h.replace(
        "case 'showLog':",
        "case 'focusPrompt':\n          this.post({ type: 'focusPrompt' });\n          break;\n        case 'showLog':"
      );
    }
    fs.writeFileSync('src/host/SidebarProvider.ts', h);
    console.log('host focusPrompt', h.includes("case 'focusPrompt'"));
  }
}

// webview focusPrompt case
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (!m.includes("case 'focusPrompt'")) {
    m = m.replace(
      "    case 'copySessionId':",
      "    case 'focusPrompt':\n      promptEl?.focus();\n      break;\n    case 'copySessionId':"
    );
    if (!m.includes("case 'focusPrompt'")) {
      m = m.replace(
        "    case 'toast':",
        "    case 'focusPrompt':\n      promptEl?.focus();\n      break;\n    case 'toast':"
      );
    }
    fs.writeFileSync('src/webview/app/main.ts', m);
    console.log('wv focusPrompt', m.includes("case 'focusPrompt'"));
  } else console.log('wv focusPrompt exists');
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
const tmp = path.join(os.tmpdir(), 'mimo-b282-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.281',
  'mimo.mimo-vscode-1.0.0-beta.280',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: /jump bottom; focusPrompt kb; KEEP PORTING"`,
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

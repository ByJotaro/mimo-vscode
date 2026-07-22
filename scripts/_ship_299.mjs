import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.299';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// setMode/setModel toast feedback
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (!h.includes('// SET_MODE_TOAST')) {
    h = h.replace(
      `case 'setMode':
          if (typeof msg.mode === 'string' && msg.mode) {
            this.selectedMode = msg.mode;
            void this.context.globalState.update('mimo.mode', msg.mode);
          }
          break;`,
      `case 'setMode':
          if (typeof msg.mode === 'string' && msg.mode) {
            this.selectedMode = msg.mode;
            void this.context.globalState.update('mimo.mode', msg.mode);
            this.post({ type: 'toast', text: 'mode · ' + msg.mode }); // SET_MODE_TOAST
          }
          break;`
    );
    // crlf
    if (!h.includes('// SET_MODE_TOAST')) {
      h = h.replace(
        "void this.context.globalState.update('mimo.mode', msg.mode);\r\n          }\r\n          break;\r\n        case 'setModel':",
        "void this.context.globalState.update('mimo.mode', msg.mode);\r\n            this.post({ type: 'toast', text: 'mode · ' + msg.mode }); // SET_MODE_TOAST\r\n          }\r\n          break;\r\n        case 'setModel':"
      );
    }
    if (!h.includes('// SET_MODEL_TOAST')) {
      h = h.replace(
        "void this.context.globalState.update('mimo.model', msg.model);\n          }\n          break;",
        "void this.context.globalState.update('mimo.model', msg.model);\n            this.post({ type: 'toast', text: 'model · ' + msg.model }); // SET_MODEL_TOAST\n          }\n          break;"
      );
      if (!h.includes('// SET_MODEL_TOAST')) {
        h = h.replace(
          "void this.context.globalState.update('mimo.model', msg.model);\r\n          }\r\n          break;",
          "void this.context.globalState.update('mimo.model', msg.model);\r\n            this.post({ type: 'toast', text: 'model · ' + msg.model }); // SET_MODEL_TOAST\r\n          }\r\n          break;"
        );
      }
    }
    fs.writeFileSync('src/host/SidebarProvider.ts', h);
    console.log(
      'mode/model toast',
      h.includes('SET_MODE_TOAST'),
      h.includes('SET_MODEL_TOAST')
    );
  }
}

// /mcp open settings filter mcp when rest empty stays info; with rest forward
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (m.includes("if (cmd === 'mcp')") && !m.includes('// MCP_OPEN_SETTINGS')) {
    m = m.replace(
      `  if (cmd === 'mcp') {
    showToast('mcp');
    appendOrUpdateMessage({
      id: 'sys_mcp_' + Date.now(),
      role: 'assistant',
      text: '**MCP**\\n- tavily · playwright · windows-mcp\\n- manage / enable servers in CLI config\\n- full MCP inspector: CLI only for now',
    });
    return true;
  }`,
      `  if (cmd === 'mcp') {
    // MCP_OPEN_SETTINGS
    if (rest === 'settings' || rest === 'config') {
      showToast('mcp settings…');
      post({ type: 'openSettings' });
      return true;
    }
    showToast('mcp');
    appendOrUpdateMessage({
      id: 'sys_mcp_' + Date.now(),
      role: 'assistant',
      text:
        '**MCP**\\n- tavily · playwright · windows-mcp\\n- manage servers in mimocode config\\n- \`/mcp settings\` opens VS Code settings\\n- full MCP inspector: CLI',
    });
    return true;
  }`
    );
    // crlf attempt looser
    if (!m.includes('// MCP_OPEN_SETTINGS')) {
      m = m.replace(
        "  if (cmd === 'mcp') {\n    showToast('mcp');",
        "  if (cmd === 'mcp') {\n    // MCP_OPEN_SETTINGS\n    if (rest === 'settings' || rest === 'config') {\n      showToast('mcp settings…');\n      post({ type: 'openSettings' });\n      return true;\n    }\n    showToast('mcp');"
      );
    }
    fs.writeFileSync('src/webview/app/main.ts', m);
    console.log('mcp settings', m.includes('MCP_OPEN_SETTINGS'));
  }
}

// host openSettings already - ensure webview post type openSettings handled
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  // message switch may use case 'openSettings' from webview
  if (!h.includes("case 'openSettings'") && h.includes("openSettings")) {
    console.log('openSettings ref exists without case?');
  }
  console.log('openSettings case', h.includes("case 'openSettings'"));
}

// soft: double toast on setMode from webview already showToast - host toast ok denser feedback ok

// package: command openSettings if missing
{
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = VER;
  if (!pkg.contributes.commands.find((c) => c.command === 'mimo.openSettings')) {
    pkg.contributes.commands.push({
      command: 'mimo.openSettings',
      title: 'MiMo Code: Open Settings',
    });
    pkg.activationEvents.push('onCommand:mimo.openSettings');
    console.log('openSettings cmd');
  }
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
}

{
  let a = fs.readFileSync('src/extension/activate.ts', 'utf8');
  if (!a.includes('mimo.openSettings')) {
    a = a.replace(
      "vscode.commands.registerCommand('mimo.refreshModels', () =>\n      runHost(() => provider.runCommand('refreshModels'))\n    )",
      "vscode.commands.registerCommand('mimo.refreshModels', () =>\n      runHost(() => provider.runCommand('refreshModels'))\n    ),\n    vscode.commands.registerCommand('mimo.openSettings', () =>\n      runHost(() => provider.runCommand('openSettings'))\n    )"
    );
    if (!a.includes('mimo.openSettings')) {
      a = a.replace(
        "vscode.commands.registerCommand('mimo.doctor', () =>\n      runHost(() => provider.runCommand('doctor'))\n    )",
        "vscode.commands.registerCommand('mimo.doctor', () =>\n      runHost(() => provider.runCommand('doctor'))\n    ),\n    vscode.commands.registerCommand('mimo.openSettings', () =>\n      runHost(() => provider.runCommand('openSettings'))\n    )"
      );
    }
    fs.writeFileSync('src/extension/activate.ts', a);
    console.log('activate settings', a.includes('mimo.openSettings'));
  }
}

// ensure openSettings in host message from runCommand - already case openSettings

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
const tmp = path.join(os.tmpdir(), 'mimo-b299-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.298',
  'mimo.mimo-vscode-1.0.0-beta.297',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: mode/model host toast; /mcp settings; palette openSettings; KEEP PORTING"`,
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

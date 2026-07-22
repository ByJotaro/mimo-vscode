import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.274';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// Double-click session title already copies — also /copy-id alias
// When hard session open: abort previous in-flight on host if switching sessions mid-stream
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (!h.includes('// ABORT_ON_SWITCH') && h.includes('private async selectSession')) {
    // inject at start of selectSession after gen++
    const a =
      'private async selectSession(sessionId: string, opts?: { soft?: boolean }): Promise<void> {\n' +
      '    if (this.lastUndoSnap && this.lastUndoSnap.sessionId !== sessionId) this.lastUndoSnap = null; // clear redo snap on session switch\n' +
      '    const gen = ++this.selectionGen;\n' +
      '    this.currentSessionId = sessionId;';
    const b =
      'private async selectSession(sessionId: string, opts?: { soft?: boolean }): Promise<void> {\n' +
      '    if (this.lastUndoSnap && this.lastUndoSnap.sessionId !== sessionId) this.lastUndoSnap = null; // clear redo snap on session switch\n' +
      '    // ABORT_ON_SWITCH: hard open different session cancels in-flight turn locally\n' +
      '    if (!opts?.soft && this.sendInFlight && this.currentSessionId && this.currentSessionId !== sessionId) {\n' +
      '      void this.client.abort(this.currentSessionId).catch(() => undefined);\n' +
      '      this.sendInFlight = false;\n' +
      '      this.post({ type: \'sendState\', busy: false });\n' +
      '    }\n' +
      '    const gen = ++this.selectionGen;\n' +
      '    this.currentSessionId = sessionId;';
    if (h.includes(a)) {
      h = h.replace(a, b);
      console.log('abort on switch ok');
    } else {
      // try looser: only after lastUndoSnap clear line
      const mark =
        'if (this.lastUndoSnap && this.lastUndoSnap.sessionId !== sessionId) this.lastUndoSnap = null; // clear redo snap on session switch';
      if (h.includes(mark) && !h.includes('ABORT_ON_SWITCH')) {
        h = h.replace(
          mark,
          mark +
            `\n    // ABORT_ON_SWITCH\n    if (!opts?.soft && this.sendInFlight && this.currentSessionId && this.currentSessionId !== sessionId) {\n      void this.client.abort(this.currentSessionId).catch(() => undefined);\n      this.sendInFlight = false;\n      this.post({ type: 'sendState', busy: false });\n    }`
        );
        console.log('abort on switch loose', h.includes('ABORT_ON_SWITCH'));
      } else console.log('selectSession anchor miss');
    }
    fs.writeFileSync('src/host/SidebarProvider.ts', h);
  } else console.log('abort switch skip');
}

// webview: Escape closes permission if open before history - already
// /log open extension output channel
{
  let a = fs.readFileSync('src/extension/activate.ts', 'utf8');
  // expose show log via host
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (!h.includes("case 'showLog'")) {
    h = h.replace(
      "case 'openSettings':",
      "case 'showLog':\n          this.log.show(true);\n          break;\n        case 'openSettings':"
    );
    if (!h.includes("case 'showLog'")) {
      h = h.replace(
        "case 'openSettings':",
        "case 'showLog':\r\n          this.log.show(true);\r\n          break;\r\n        case 'openSettings':"
      );
    }
    fs.writeFileSync('src/host/SidebarProvider.ts', h);
    console.log('showLog', h.includes("case 'showLog'"));
  }
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (!m.includes("cmd === 'log'")) {
    const ins = `  if (cmd === 'log' || cmd === 'output') {
    showToast('log…');
    post({ type: 'showLog' });
    return true;
  }
`;
    if (m.includes("  if (cmd === 'config')")) {
      m = m.replace("  if (cmd === 'config')", ins + "  if (cmd === 'config')");
      fs.writeFileSync('src/webview/app/main.ts', m);
      console.log('log slash ok');
    }
  }
  let cat = fs.readFileSync('src/host/cli/slashCatalog.ts', 'utf8');
  if (!cat.includes("name: 'log'")) {
    cat = cat.replace(
      "    { name: 'config', description: 'Open MiMo VS Code settings' },",
      "    { name: 'config', description: 'Open MiMo VS Code settings' },\n    { name: 'log', description: 'Show MiMo extension output channel' },\n    { name: 'output', description: 'Show MiMo extension output channel' },"
    );
    // config description may differ
    if (!cat.includes("name: 'log'")) {
      cat = cat.replace(
        "    { name: 'help', description: 'Show help' },",
        "    { name: 'help', description: 'Show help' },\n    { name: 'log', description: 'Show MiMo extension output channel' },"
      );
    }
    fs.writeFileSync('src/host/cli/slashCatalog.ts', cat);
    console.log('catalog log', cat.includes("name: 'log'"));
  }
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = VER;
if (!pkg.contributes.commands.find((c) => c.command === 'mimo.showLog')) {
  pkg.contributes.commands.push({
    command: 'mimo.showLog',
    title: 'MiMo Code: Show Output Log',
  });
  pkg.activationEvents.push('onCommand:mimo.showLog');
}
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');

// activate
{
  let a = fs.readFileSync('src/extension/activate.ts', 'utf8');
  if (!a.includes('mimo.showLog')) {
    a = a.replace(
      "vscode.commands.registerCommand('mimo.copySessionId', () =>\n      runHost(() => provider.runCommand('copySessionId'))\n    )",
      "vscode.commands.registerCommand('mimo.copySessionId', () =>\n      runHost(() => provider.runCommand('copySessionId'))\n    ),\n    vscode.commands.registerCommand('mimo.showLog', () =>\n      runHost(() => provider.runCommand('showLog'))\n    )"
    );
    if (!a.includes('mimo.showLog')) {
      // append before closing of push
      a = a.replace(
        "vscode.commands.registerCommand('mimo.redo', () =>\n      runHost(() => provider.runCommand('redoLast'))\n    ),",
        "vscode.commands.registerCommand('mimo.redo', () =>\n      runHost(() => provider.runCommand('redoLast'))\n    ),\n    vscode.commands.registerCommand('mimo.showLog', () =>\n      runHost(() => provider.runCommand('showLog'))\n    ),"
      );
    }
    fs.writeFileSync('src/extension/activate.ts', a);
    console.log('activate log', a.includes('mimo.showLog'));
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
const tmp = path.join(os.tmpdir(), 'mimo-b274-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.273',
  'mimo.mimo-vscode-1.0.0-beta.272',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: /log output; abort on hard session switch; KEEP PORTING"`,
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

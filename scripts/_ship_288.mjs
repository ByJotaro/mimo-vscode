import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.288';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// Host: soft toast when soft selectSession starts on hard open already "opening"
// Functional: when exportSession empty messages toast already
// Soft: when listSessions error, toast

// Webview: Ctrl+Shift+C copy last assistant? optional skip
// Soft: double-enter on empty already toast empty

// Host soft: dispose() already aborts? check dispose
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (h.includes('dispose()') && !h.includes('// DISPOSE_ABORT')) {
    // find dispose method
    const re = /dispose\(\)\s*:\s*void\s*\{/;
    if (re.test(h)) {
      h = h.replace(
        re,
        "dispose(): void {\n    // DISPOSE_ABORT\n    if (this.sendInFlight && this.currentSessionId) {\n      void this.client.abort(this.currentSessionId).catch(() => undefined);\n      this.sendInFlight = false;\n    }"
      );
      fs.writeFileSync('src/host/SidebarProvider.ts', h);
      console.log('dispose abort', h.includes('DISPOSE_ABORT'));
    } else {
      const i = h.indexOf('dispose(');
      console.log('dispose sample', i >= 0 ? h.slice(i, i + 200) : 'none');
    }
  }
}

// When soft reconnect after models refresh, post workspaceRoot already
// Soft: /mcp forward already

// package: command refresh models if missing
{
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = VER;
  if (!pkg.contributes.commands.find((c) => c.command === 'mimo.refreshModels')) {
    pkg.contributes.commands.push({
      command: 'mimo.refreshModels',
      title: 'MiMo Code: Refresh Models',
    });
    pkg.activationEvents.push('onCommand:mimo.refreshModels');
    console.log('refreshModels cmd');
  }
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
}

{
  let a = fs.readFileSync('src/extension/activate.ts', 'utf8');
  if (!a.includes('mimo.refreshModels')) {
    a = a.replace(
      "vscode.commands.registerCommand('mimo.focusPrompt', () =>\n      runHost(() => provider.runCommand('focusPrompt'))\n    )",
      "vscode.commands.registerCommand('mimo.focusPrompt', () =>\n      runHost(() => provider.runCommand('focusPrompt'))\n    ),\n    vscode.commands.registerCommand('mimo.refreshModels', () =>\n      runHost(() => provider.runCommand('refreshModels'))\n    )"
    );
    if (!a.includes('mimo.refreshModels')) {
      a = a.replace(
        "vscode.commands.registerCommand('mimo.doctor', () =>\n      runHost(() => provider.runCommand('doctor'))\n    )",
        "vscode.commands.registerCommand('mimo.doctor', () =>\n      runHost(() => provider.runCommand('doctor'))\n    ),\n    vscode.commands.registerCommand('mimo.refreshModels', () =>\n      runHost(() => provider.runCommand('refreshModels'))\n    )"
      );
    }
    fs.writeFileSync('src/extension/activate.ts', a);
    console.log('activate refresh', a.includes('mimo.refreshModels'));
  }
}

// host case refreshModels
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (!h.includes("case 'refreshModels'")) {
    h = h.replace(
      "case 'doctor':",
      "case 'refreshModels':\n          void this.refreshModels();\n          break;\n        case 'doctor':"
    );
    if (!h.includes("case 'refreshModels'")) {
      // method name may differ
      if (h.includes('refreshModels(') || h.includes('private async refreshModels')) {
        h = h.replace(
          "case 'showLog':",
          "case 'refreshModels':\n          void this.refreshModels();\n          break;\n        case 'showLog':"
        );
      } else {
        // find how models are refreshed
        const i = h.indexOf('refreshModel');
        console.log('refreshModel sample', i >= 0 ? h.slice(i, i + 150) : 'none');
      }
    }
    fs.writeFileSync('src/host/SidebarProvider.ts', h);
    console.log('case refreshModels', h.includes("case 'refreshModels'"));
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
const tmp = path.join(os.tmpdir(), 'mimo-b288-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.287',
  'mimo.mimo-vscode-1.0.0-beta.286',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: dispose abort; palette refresh models; KEEP PORTING"`,
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

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.300';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// /memory notes path reveal - open memory dir via folder
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (m.includes("if (cmd === 'memory')") && !m.includes('// MEMORY_OPEN')) {
    m = m.replace(
      `  if (cmd === 'memory') {
    showToast('memory');
    appendOrUpdateMessage({
      id: 'sys_memory_' + Date.now(),
      role: 'assistant',
      text: '**Memory**\\n- project + session checkpoints\\n- full tree / inspect in CLI (/memory)\\n- session notes under mimocode memory dir',
    });
    return true;
  }`,
      `  if (cmd === 'memory') {
    // MEMORY_OPEN
    if (rest === 'open' || rest === 'folder') {
      showToast('memory folder…');
      post({ type: 'openMemoryDir' });
      return true;
    }
    showToast('memory');
    appendOrUpdateMessage({
      id: 'sys_memory_' + Date.now(),
      role: 'assistant',
      text:
        '**Memory**\\n- project + session checkpoints\\n- \`/memory open\` → reveal mimocode memory dir\\n- full tree: CLI \`/memory\`',
    });
    return true;
  }`
    );
    if (!m.includes('// MEMORY_OPEN')) {
      m = m.replace(
        "  if (cmd === 'memory') {\n    showToast('memory');",
        "  if (cmd === 'memory') {\n    // MEMORY_OPEN\n    if (rest === 'open' || rest === 'folder') {\n      showToast('memory folder…');\n      post({ type: 'openMemoryDir' });\n      return true;\n    }\n    showToast('memory');"
      );
    }
    fs.writeFileSync('src/webview/app/main.ts', m);
    console.log('memory open', m.includes('MEMORY_OPEN'));
  }
}

// host openMemoryDir
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (!h.includes("case 'openMemoryDir'")) {
    const block = `        case 'openMemoryDir': {
          const home = process.env.USERPROFILE || process.env.HOME || '';
          const mem = path.join(home, '.local', 'share', 'mimocode', 'memory');
          try {
            if (!fs.existsSync(mem)) fs.mkdirSync(mem, { recursive: true });
            void vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(mem));
            this.post({ type: 'toast', text: 'memory dir' });
          } catch (e) {
            this.post({ type: 'toast', text: 'memory dir failed' });
            this.log.appendLine('[openMemoryDir] ' + String(e).slice(0, 120));
          }
          break;
        }
`;
    // need fs import?
    if (!h.includes("import * as fs from 'fs'") && !h.includes("from 'fs'") && !h.includes('from "fs"')) {
      if (h.includes("import * as path from 'path'") || h.includes("import path from 'path'")) {
        h = h.replace(
          /import \* as path from 'path';|import path from 'path';/,
          (s) => s + "\nimport * as fs from 'fs';"
        );
        if (!h.includes("from 'fs'") && !h.includes('from "fs"')) {
          h = h.replace(
            "import * as vscode from 'vscode';",
            "import * as vscode from 'vscode';\nimport * as fs from 'fs';"
          );
        }
      } else {
        h = h.replace(
          "import * as vscode from 'vscode';",
          "import * as vscode from 'vscode';\nimport * as fs from 'fs';\nimport * as path from 'path';"
        );
      }
    }
    if (h.includes("case 'openFolder':") || h.includes("case 'openFilePath':")) {
      h = h.replace("case 'openFolder':", block + "        case 'openFolder':");
      if (!h.includes("case 'openMemoryDir'")) {
        h = h.replace("case 'openFilePath':", block + "        case 'openFilePath':");
      }
    } else if (h.includes("case 'doctor':")) {
      h = h.replace("case 'doctor':", block + "        case 'doctor':");
    }
    fs.writeFileSync('src/host/SidebarProvider.ts', h);
    console.log('host memory dir', h.includes("case 'openMemoryDir'"), h.includes("from 'fs'"));
  }
}

// /config alias already; soft: palette openSettings in view title
{
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = VER;
  if (!pkg.contributes.menus) pkg.contributes.menus = {};
  if (!pkg.contributes.menus['view/title']) pkg.contributes.menus['view/title'] = [];
  const vt = pkg.contributes.menus['view/title'];
  if (!vt.find((x) => x.command === 'mimo.openSettings')) {
    vt.push({
      command: 'mimo.openSettings',
      when: "view == mimo.sidebar",
      group: 'navigation@7',
    });
    console.log('view title settings');
  }
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
}

// soft: when soft sendPrompt with model/mode, host persists - already
// Functional: soft toast when soft setMode duplicates webview - ok

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
const tmp = path.join(os.tmpdir(), 'mimo-b300-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.299',
  'mimo.mimo-vscode-1.0.0-beta.298',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: /memory open dir; settings view title; KEEP PORTING"`,
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

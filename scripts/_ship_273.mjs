import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.273';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// When goHome: clear usage dataset so status falls back to version
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (!m.includes('// HOME_CLEAR_USAGE') && m.includes("if (message.showStartupChooser === true)")) {
    m = m.replace(
      "if (message.showStartupChooser === true) {\n        activeSessionId = '';\n        lastUserPrompt = '';",
      "if (message.showStartupChooser === true) {\n        activeSessionId = '';\n        lastUserPrompt = '';\n        if (statusLabel) delete statusLabel.dataset.usage; // HOME_CLEAR_USAGE"
    );
    if (!m.includes('HOME_CLEAR_USAGE')) {
      m = m.replace(
        "if (message.showStartupChooser === true) {\r\n        activeSessionId = '';\r\n        lastUserPrompt = '';",
        "if (message.showStartupChooser === true) {\r\n        activeSessionId = '';\r\n        lastUserPrompt = '';\r\n        if (statusLabel) delete statusLabel.dataset.usage; // HOME_CLEAR_USAGE"
      );
    }
    fs.writeFileSync('src/webview/app/main.ts', m);
    console.log('home clear usage', m.includes('HOME_CLEAR_USAGE'));
  }
}

// /spawn show spawn pid from status if present
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (!m.includes("cmd === 'spawn'") && !m.includes("cmd === 'port'")) {
    const ins = `  if (cmd === 'port' || cmd === 'spawn' || cmd === 'server') {
    const srv = statusLabel?.dataset.server || statusLabel?.textContent || '—';
    const ver = statusLabel?.dataset.version || '—';
    const usage = statusLabel?.dataset.usage || '—';
    showToast('server');
    appendOrUpdateMessage({
      id: 'sys_srv_' + Date.now(),
      role: 'assistant',
      text:
        '**Server**\\n- status: \`' +
        srv +
        '\`\\n- version: \`' +
        ver +
        '\`\\n- usage: \`' +
        usage +
        '\`\\n- workspace: \`' +
        (workspaceRoot || '—') +
        '\`',
    });
    return true;
  }
`;
    if (m.includes("  if (cmd === 'status'") || m.includes("cmd === 'cost' || cmd === 'status'")) {
      m = m.replace(
        "  if (cmd === 'cost' || cmd === 'status' || cmd === 'usage') {",
        ins + "  if (cmd === 'cost' || cmd === 'status' || cmd === 'usage') {"
      );
      fs.writeFileSync('src/webview/app/main.ts', m);
      console.log('server slash', m.includes("cmd === 'port'"));
    } else console.log('status block miss');
  }
}

// catalog
{
  let cat = fs.readFileSync('src/host/cli/slashCatalog.ts', 'utf8');
  if (!cat.includes("name: 'port'")) {
    cat = cat.replace(
      "    { name: 'status', description: 'Show session status' },",
      "    { name: 'status', description: 'Show session status' },\n    { name: 'port', description: 'Show serve status / workspace' },\n    { name: 'server', description: 'Show serve status / workspace' },"
    );
    fs.writeFileSync('src/host/cli/slashCatalog.ts', cat);
    console.log('catalog port');
  }
}

// host init also set dataset version already via webview
// soft: when connected detail includes spawn:port - good

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
const tmp = path.join(os.tmpdir(), 'mimo-b273-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.272',
  'mimo.mimo-vscode-1.0.0-beta.271',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: /port server card; home clears usage; KEEP PORTING"`,
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

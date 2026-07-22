import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.293';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// When soft streamError: host already posts error; ensure sendInFlight false
// Functional: soft toast when soft selectSession opens session (hard only "opening")
// Soft: when goHome, clear currentSessionId already

// /copy-last: copy last assistant message text
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (!m.includes("cmd === 'copy-last'") && !m.includes("cmd === 'last'")) {
    const ins = `  if (cmd === 'copy-last' || cmd === 'last') {
    const msgs = chat.querySelectorAll('.msg.assistant, .message.assistant, [data-role="assistant"]');
    const last = msgs[msgs.length - 1] as HTMLElement | undefined;
    const t = (last?.innerText || last?.textContent || '').trim();
    if (!t) {
      showToast('no assistant msg');
      return true;
    }
    if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(t);
    showToast('copied last');
    return true;
  }
`;
    if (m.includes("  if (cmd === 'copy'") || m.includes("  if (cmd === 'export'")) {
      if (m.includes("  if (cmd === 'export'")) {
        m = m.replace("  if (cmd === 'export'", ins + "  if (cmd === 'export'");
      } else {
        m = m.replace("  if (cmd === 'copy'", ins + "  if (cmd === 'copy'");
      }
      fs.writeFileSync('src/webview/app/main.ts', m);
      console.log('copy-last', m.includes("cmd === 'copy-last'"));
    } else if (m.includes("  if (cmd === 'help')")) {
      m = m.replace("  if (cmd === 'help')", ins + "  if (cmd === 'help')");
      fs.writeFileSync('src/webview/app/main.ts', m);
      console.log('copy-last help', m.includes("cmd === 'copy-last'"));
    }
  }
}

// catalog
{
  let cat = fs.readFileSync('src/host/cli/slashCatalog.ts', 'utf8');
  if (!cat.includes("name: 'copy-last'")) {
    cat = cat.replace(
      "    { name: 'export', description: 'Export session to file' },",
      "    { name: 'export', description: 'Export session to file' },\n    { name: 'copy-last', description: 'Copy last assistant message' },"
    );
    if (!cat.includes("name: 'copy-last'")) {
      cat = cat.replace(
        "    { name: 'copy', description: 'Copy session to clipboard' },",
        "    { name: 'copy', description: 'Copy session to clipboard' },\n    { name: 'copy-last', description: 'Copy last assistant message' },"
      );
    }
    if (!cat.includes("name: 'copy-last'")) {
      cat = cat.replace(
        "    { name: 'share', description: 'Copy session to clipboard' },",
        "    { name: 'share', description: 'Copy session to clipboard' },\n    { name: 'copy-last', description: 'Copy last assistant message' },"
      );
    }
    fs.writeFileSync('src/host/cli/slashCatalog.ts', cat);
    console.log('catalog copy-last', cat.includes("name: 'copy-last'"));
  }
}

// Host soft: when soft select after streamDone fails gen, still refreshUsage - already
// Soft: package view title for refresh models
{
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = VER;
  if (!pkg.contributes.menus) pkg.contributes.menus = {};
  if (!pkg.contributes.menus['view/title']) pkg.contributes.menus['view/title'] = [];
  const vt = pkg.contributes.menus['view/title'];
  if (!vt.find((x) => x.command === 'mimo.refreshModels')) {
    vt.push({
      command: 'mimo.refreshModels',
      when: "view == mimo.sidebar",
      group: 'navigation@8',
    });
    console.log('view title refreshModels');
  }
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
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
const tmp = path.join(os.tmpdir(), 'mimo-b293-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.292',
  'mimo.mimo-vscode-1.0.0-beta.291',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: /copy-last; view title refresh models; KEEP PORTING"`,
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

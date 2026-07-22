import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.278';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// /version local - extension package version
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (!m.includes("cmd === 'version'") && !m.includes("cmd === 'ver'")) {
    const ins = `  if (cmd === 'version' || cmd === 'ver') {
    const v = statusLabel?.dataset.version || '—';
    showToast('v' + v);
    appendOrUpdateMessage({
      id: 'sys_ver_' + Date.now(),
      role: 'assistant',
      text: '**Version**\\n- extension: \`' + v + '\`',
    });
    return true;
  }
`;
    if (m.includes("  if (cmd === 'doctor')")) {
      m = m.replace("  if (cmd === 'doctor')", ins + "  if (cmd === 'doctor')");
    } else if (m.includes("  if (cmd === 'help')")) {
      m = m.replace("  if (cmd === 'help')", ins + "  if (cmd === 'help')");
    }
    fs.writeFileSync('src/webview/app/main.ts', m);
    console.log('version slash', m.includes("cmd === 'version'"));
  }
  // ensure dataset.version set on init - already
}

// catalog
{
  let cat = fs.readFileSync('src/host/cli/slashCatalog.ts', 'utf8');
  if (!cat.includes("name: 'version'")) {
    cat = cat.replace(
      "    { name: 'doctor', description: 'Extension diagnostics (bin/db/sqlite)' },",
      "    { name: 'doctor', description: 'Extension diagnostics (bin/db/sqlite)' },\n    { name: 'version', description: 'Show extension package version' },"
    );
    fs.writeFileSync('src/host/cli/slashCatalog.ts', cat);
    console.log('catalog version');
  }
}

// Host: send extension version in every sendInit (already version field)
// Soft: when dataset.version empty, set from package on first init - already

// When webview ready: post also sets version into dataset - check init handler
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (m.includes("message.version") && !m.includes('dataset.version')) {
    // add dataset.version assignment
    m = m.replace(
      "if (message.version && statusLabel && !busy) {\n        statusLabel.dataset.server = String(message.version);",
      "if (message.version && statusLabel) {\n        statusLabel.dataset.version = String(message.version);\n        if (!busy) statusLabel.dataset.server = statusLabel.dataset.server || ('mimo · ' + String(message.version));"
    );
    // if failed try simpler
    if (!m.includes('dataset.version')) {
      m = m.replace(
        "statusLabel.dataset.server = String(message.version);",
        "statusLabel.dataset.version = String(message.version);\n        statusLabel.dataset.server = String(message.version);"
      );
    }
    fs.writeFileSync('src/webview/app/main.ts', m);
    console.log('dataset.version', m.includes('dataset.version'));
  } else console.log('version dataset ok');
}

// When user open recent - toast already opening
// Soft: after export save toast already

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
const tmp = path.join(os.tmpdir(), 'mimo-b278-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.277',
  'mimo.mimo-vscode-1.0.0-beta.276',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: /version; ensure dataset.version; KEEP PORTING"`,
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

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const main = fs.readFileSync('src/webview/app/main.ts', 'utf8');
console.log('has_paste', main.includes("addEventListener('paste'"));

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = '1.0.0-beta.269';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
console.log('version', pkg.version);

const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
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

const vsixName = 'mimo-vscode-v2-1.0.0-beta.269.vsix';
run(`npx --yes @vscode/vsce package --no-dependencies --out ${vsixName}`);

const vsix = path.resolve(vsixName);
const extRoot = path.join(os.homedir(), '.vscode', 'extensions');
const tmp = path.join(os.tmpdir(), 'mimo-b269-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.269',
  'mimo.mimo-vscode-1.0.0-beta.268',
  'mimo.mimo-vscode-1.0.0-beta.267',
]) {
  copyDir(src, path.join(extRoot, folder));
}

let fix = fs.readFileSync('scripts/fix-extensions-json.mjs', 'utf8');
if (!fix.includes('beta.269')) {
  fix = fix.replace(
    'const preferred = [',
    "const preferred = [\n  'mimo.mimo-vscode-1.0.0-beta.269',"
  );
  fs.writeFileSync('scripts/fix-extensions-json.mjs', fix);
}
run('node scripts/fix-extensions-json.mjs');

run('git add -A');
try {
  execSync(
    'git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 beta.269: paste multi-path into prompt; KEEP PORTING"',
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

console.log(
  'TIP=' + JSON.parse(fs.readFileSync('package.json', 'utf8')).version + ' FAIL=' + fail + ' KEEP_PORTING'
);

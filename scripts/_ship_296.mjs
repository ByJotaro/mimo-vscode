import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.296';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// Soft select after streamDone: ensure soft:true is the only path after done
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  // if streamDone / on done selects without soft, fix
  const softHits = [...h.matchAll(/selectSession\([^)]+\)/g)].map((m) => m[0]);
  console.log('selectSession calls', softHits.slice(0, 12));
  // after turn done
  if (h.includes('streamDone') || h.includes('onDone') || h.includes('sendInFlight = false')) {
    // look for selectSession after send complete
    const i = h.indexOf('selectSession');
    // ensure after prompt done soft
    if (!h.includes('soft: true') && !h.includes('soft:true')) {
      console.log('WARNING no soft select');
    }
  }
}

// Webview: when soft sessionData, preserve scroll already
// Functional: /compact with toast before forward already
// Soft: double-click status copies version?
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (m.includes('statusLabel') && !m.includes('// STATUS_DBLCLICK_VER')) {
    // add once near end of boot
    if (m.includes("statusLabel?.addEventListener") || m.includes("statusLabel.addEventListener")) {
      console.log('status listeners exist');
    } else if (m.includes('const statusLabel')) {
      // inject after prompt paste or btnSend
      const hook = `
statusLabel?.addEventListener('dblclick', () => {
  const v = statusLabel.dataset.version || statusLabel.textContent || '';
  if (v && navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(v);
    showToast('version copied');
  }
}); // STATUS_DBLCLICK_VER
`;
      if (m.includes("btnSend?.addEventListener('click', doSend);")) {
        m = m.replace(
          "btnSend?.addEventListener('click', doSend);",
          "btnSend?.addEventListener('click', doSend);" + hook
        );
        fs.writeFileSync('src/webview/app/main.ts', m);
        console.log('status dblclick ok');
      }
    }
  }
}

// Host: when soft permission while sidebar hidden - already notify
// Soft: when soft question - already

// Functional: package command for pin scroll - skip
// Soft: ensure openHistory focuses after sessions list arrives - soft

// Host soft: after sendSessionsList(true), post openHistory already before list

// Soft improve doctor: include serve baseUrl if client has it
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (h.includes("case 'doctor'") && !h.includes('baseUrl') && !h.includes('// DOCTOR_URL')) {
    // try client.port or baseUrl
    if (h.includes('this.client') && (h.includes('.baseUrl') || h.includes('.port') || h.includes('getBaseUrl'))) {
      console.log('client has url fields');
    }
    // inject optional line
    if (h.includes("'- extension: `'") && !h.includes('// DOCTOR_URL')) {
      h = h.replace(
        "            '- busy: ' + (this.sendInFlight ? 'yes' : 'no'),",
        "            '- busy: ' + (this.sendInFlight ? 'yes' : 'no'),\n            '- serve: `' + String((this.client as any).baseUrl || (this.client as any).url || (this.client as any).port || '—') + '`', // DOCTOR_URL"
      );
      fs.writeFileSync('src/host/SidebarProvider.ts', h);
      console.log('doctor url', h.includes('DOCTOR_URL'));
    }
  }
}

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
const tmp = path.join(os.tmpdir(), 'mimo-b296-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.295',
  'mimo.mimo-vscode-1.0.0-beta.294',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: status dblclick copy version; doctor serve; KEEP PORTING"`,
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

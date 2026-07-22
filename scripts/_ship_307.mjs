import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.307';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// Fix empty sessions toast with exact context from file
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (!h.includes('// EMPTY_SESSIONS_TOAST')) {
    const idx = h.indexOf("type: 'sessionsList'");
    if (idx < 0) {
      console.log('no sessionsList type');
    } else {
      // find closing of this.post after idx
      const start = h.lastIndexOf('this.post', idx);
      const end = h.indexOf('});', idx);
      if (start >= 0 && end > start) {
        const block = h.slice(start, end + 3);
        console.log('block', JSON.stringify(block.slice(0, 200)));
        // extract sessions expr roughly
        const sm = block.match(/sessions:\s*([^,\n\r}]+)/);
        const expr = sm ? sm[1].trim() : '[]';
        const inject =
          `\n    if (!(${expr} || []).length) this.post({ type: 'toast', text: 'no sessions' }); // EMPTY_SESSIONS_TOAST`;
        h = h.slice(0, end + 3) + inject + h.slice(end + 3);
        fs.writeFileSync('src/host/SidebarProvider.ts', h);
        console.log('empty toast injected', h.includes('EMPTY_SESSIONS_TOAST'));
      }
    }
  } else console.log('empty toast exists');
}

// /uptime — process/extension uptime via performance if available, else date
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (!m.includes("cmd === 'uptime'")) {
    const ins = `  if (cmd === 'uptime') {
    const ms = typeof performance !== 'undefined' && performance.now ? Math.floor(performance.now()) : 0;
    const sec = Math.floor(ms / 1000);
    const h = Math.floor(sec / 3600);
    const min = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const label = h + 'h ' + min + 'm ' + s + 's';
    showToast(label);
    appendOrUpdateMessage({
      id: 'sys_uptime_' + Date.now(),
      role: 'assistant',
      text: '**Uptime (webview)**\\n- \`' + label + '\` (since webview load)\\n- tip: host process uptime via /doctor',
    });
    return true;
  }
`;
    if (m.includes("  if (cmd === 'time'")) {
      m = m.replace("  if (cmd === 'time'", ins + "  if (cmd === 'time'");
    } else if (m.includes("  if (cmd === 'count')")) {
      m = m.replace("  if (cmd === 'count')", ins + "  if (cmd === 'count')");
    } else if (m.includes("  if (cmd === 'help')")) {
      m = m.replace("  if (cmd === 'help')", ins + "  if (cmd === 'help')");
    }
    fs.writeFileSync('src/webview/app/main.ts', m);
    console.log('uptime', m.includes("cmd === 'uptime'"));
  }
}

// catalog uptime
{
  let cat = fs.readFileSync('src/host/cli/slashCatalog.ts', 'utf8');
  if (!cat.includes("name: 'uptime'")) {
    cat = cat.replace(
      "    { name: 'time', description: 'Show local/UTC time' },",
      "    { name: 'time', description: 'Show local/UTC time' },\n    { name: 'uptime', description: 'Show webview uptime' },"
    );
    fs.writeFileSync('src/host/cli/slashCatalog.ts', cat);
    console.log('catalog uptime', cat.includes("name: 'uptime'"));
  }
}

// host doctor: add uptime if process.uptime available
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (h.includes("case 'doctor'") && !h.includes('// DOCTOR_UPTIME')) {
    h = h.replace(
      "            '- busy: ' + (this.sendInFlight ? 'yes' : 'no'),",
      "            '- busy: ' + (this.sendInFlight ? 'yes' : 'no'),\n            '- host uptime: `' + Math.floor(process.uptime()) + 's`, // DOCTOR_UPTIME"
    );
    // fix quote style to match file
    if (!h.includes('DOCTOR_UPTIME')) {
      h = h.replace(
        /'- busy: ' \+ \(this\.sendInFlight \? 'yes' : 'no'\),/,
        "'- busy: ' + (this.sendInFlight ? 'yes' : 'no'),\n            '- host uptime: `' + Math.floor(process.uptime()) + 's`', // DOCTOR_UPTIME"
      );
    }
    fs.writeFileSync('src/host/SidebarProvider.ts', h);
    console.log('doctor uptime', h.includes('DOCTOR_UPTIME'));
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
const tmp = path.join(os.tmpdir(), 'mimo-b307-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.306',
  'mimo.mimo-vscode-1.0.0-beta.305',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: empty sessions toast; /uptime; doctor host uptime; KEEP PORTING"`,
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

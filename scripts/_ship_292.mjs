import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.292';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// empty host sendPrompt
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (!h.includes('// EMPTY_HOST_SEND')) {
    // multi-line signature
    const re =
      /async sendPrompt\(\r?\n\s*text: string,\r?\n\s*sessionId\?: string,\r?\n\s*mode\?: string,\r?\n\s*model\?: string\r?\n\s*\): Promise<void> \{\r?\n/;
    if (re.test(h)) {
      h = h.replace(
        re,
        (m) =>
          m +
          "    if (!String(text || '').trim()) {\n      this.post({ type: 'toast', text: 'empty' }); // EMPTY_HOST_SEND\n      return;\n    }\n"
      );
      fs.writeFileSync('src/host/SidebarProvider.ts', h);
      console.log('empty host ok');
    } else {
      // looser: after Promise<void> { following sendPrompt
      const idx = h.indexOf('async sendPrompt(');
      const brace = h.indexOf('{', idx);
      if (idx >= 0 && brace >= 0) {
        const insert =
          "\n    if (!String(text || '').trim()) {\n      this.post({ type: 'toast', text: 'empty' }); // EMPTY_HOST_SEND\n      return;\n    }";
        h = h.slice(0, brace + 1) + insert + h.slice(brace + 1);
        fs.writeFileSync('src/host/SidebarProvider.ts', h);
        console.log('empty host insert', h.includes('EMPTY_HOST_SEND'));
      }
    }
  }
}

// history focus: find showHistoryPanel and add focus at end
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (!m.includes('// HIST_FOCUS_SEARCH')) {
    // find showHistoryPanel function - search for hist-close or id hist
    const i = m.indexOf('function showHistoryPanel');
    if (i >= 0) {
      // find matching end - look for next \nfunction  after i
      const rest = m.slice(i);
      const nextFn = rest.search(/\nfunction /);
      const end = nextFn > 0 ? i + nextFn : -1;
      if (end > 0) {
        // insert before last }
        const body = m.slice(i, end);
        // find last } of function - last line before end that is }
        const lastBrace = body.lastIndexOf('\n}');
        if (lastBrace > 0) {
          const abs = i + lastBrace;
          const focus =
            "\n  setTimeout(() => {\n    const s = document.querySelector('#hist-search, .hist-search, .history-search, input[type=\"search\"]') as HTMLInputElement | null;\n    s?.focus();\n  }, 40); // HIST_FOCUS_SEARCH\n";
          m = m.slice(0, abs) + focus + m.slice(abs);
          fs.writeFileSync('src/webview/app/main.ts', m);
          console.log('hist focus end', m.includes('HIST_FOCUS_SEARCH'));
        }
      } else console.log('no next fn');
    } else console.log('no showHistoryPanel');
  } else console.log('hist focus exists');
}

// soft: when soft select after streamDone - host already
// When soft permission while busy - still show

// package: mimo.checkVersion - ensure works - skip
// Soft: status bar verShort - check activate
{
  let a = fs.readFileSync('src/extension/activate.ts', 'utf8');
  console.log('verShort', a.includes('verShort') || a.includes('packageJSON.version'));
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
const tmp = path.join(os.tmpdir(), 'mimo-b292-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.291',
  'mimo.mimo-vscode-1.0.0-beta.290',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: host empty-send; history search focus; KEEP PORTING"`,
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

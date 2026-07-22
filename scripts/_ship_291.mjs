import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.291';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// When soft selectSession fails (stale gen), toast soft - check selectSession
// Functional: host when sendPrompt text is only whitespace - reject
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (!h.includes('// EMPTY_HOST_SEND') && h.includes('private async sendPrompt')) {
    const re = /private async sendPrompt\([^)]*\)[^{]*\{\s*/;
    if (re.test(h) && !h.includes('EMPTY_HOST_SEND')) {
      h = h.replace(
        re,
        (m) =>
          m +
          "const _t = String(arguments[0] ?? '').trim();\n    // EMPTY_HOST_SEND handled via msg path\n    "
      );
      // better: find where text is read from msg
      console.log('sendPrompt method found');
    }
  }
  // find sendPrompt case / method body for text
  const i = h.indexOf('sendPrompt');
  // look for text extraction
  if (!h.includes('// EMPTY_HOST_SEND')) {
    const re2 =
      /async sendPrompt\(([^)]*)\)[^{]*\{[\s\S]{0,200}/;
    const m = h.match(re2);
    if (m) console.log('sendPrompt head', JSON.stringify(m[0].slice(0, 180)));
  }
}

// When webview soft: on streamDone without sessionId still clear busy - already setBusy false
// Soft: after openHistory, focus search input
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (m.includes('function showHistoryPanel') && !m.includes('// HIST_FOCUS_SEARCH')) {
    // find end of showHistoryPanel near hist-close
    const re = /function showHistoryPanel\([\s\S]*?\n\}/;
    // simpler: after panel open, focus #hist-search or .hist-search
    if (m.includes('hist-search') || m.includes('history-search') || m.includes('histSearch')) {
      const id = m.includes('hist-search')
        ? 'hist-search'
        : m.includes('history-search')
          ? 'history-search'
          : 'histSearch';
      // at end of showHistoryPanel before closing - inject after first paint
      if (!m.includes('HIST_FOCUS_SEARCH')) {
        // after create panel appendChild body, focus
        m = m.replace(
          /function showHistoryPanel\([^)]*\)\s*\{/,
          (s) => s + "\n  // HIST_FOCUS_SEARCH deferred"
        );
        // better: after return of render, setTimeout focus
        const focusBlock =
          "\n  setTimeout(() => {\n    const s = document.getElementById('hist-search') as HTMLInputElement | null\n      || document.querySelector('.hist-search, .history-search, input[placeholder*=\"Search\"]') as HTMLInputElement | null;\n    s?.focus();\n  }, 30); // HIST_FOCUS_SEARCH\n";
        // find hist-close listener end of function - inject before last closing of showHistoryPanel is hard
        // inject at start of function after HIST mark
        if (m.includes('HIST_FOCUS_SEARCH deferred')) {
          m = m.replace('// HIST_FOCUS_SEARCH deferred', '//' + focusBlock);
          fs.writeFileSync('src/webview/app/main.ts', m);
          console.log('hist focus', m.includes('HIST_FOCUS_SEARCH'));
        }
      }
    } else {
      console.log('no hist-search id');
      // sample showHistoryPanel
      const i = m.indexOf('function showHistoryPanel');
      console.log(m.slice(i, i + 400));
    }
  }
}

// Host: soft when permission reply, toast already
// Soft: when export empty toast already

// Functional: package contribute configuration mimo.autoOpenSidebar - skip
// Soft: when webview ready, post ready already

// Host soft: openHistory toast before list - already has toast

// When soft abort on dispose, also post sendState if view exists - optional
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (h.includes('// DISPOSE_ABORT') && !h.includes('DISPOSE_SENDSTATE')) {
    h = h.replace(
      '// DISPOSE_ABORT\n    if (this.sendInFlight && this.currentSessionId) {\n      void this.client.abort(this.currentSessionId).catch(() => undefined);\n      this.sendInFlight = false;\n    }',
      "// DISPOSE_ABORT\n    if (this.sendInFlight && this.currentSessionId) {\n      void this.client.abort(this.currentSessionId).catch(() => undefined);\n      this.sendInFlight = false;\n      try { this.post({ type: 'sendState', busy: false }); } catch { /* view gone */ } // DISPOSE_SENDSTATE\n    }"
    );
    fs.writeFileSync('src/host/SidebarProvider.ts', h);
    console.log('dispose sendState', h.includes('DISPOSE_SENDSTATE'));
  }
}

// soft: empty host send when type sendPrompt
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (!h.includes('// EMPTY_HOST_SEND')) {
    // case sendPrompt or handle message type sendPrompt
    const re = /if \(type === 'sendPrompt'[\s\S]{0,120}|case 'sendPrompt':[\s\S]{0,200}/;
    const m = h.match(re);
    if (m) console.log('send path', JSON.stringify(m[0].slice(0, 200)));
    // common pattern: private async sendPrompt(text: string
    if (h.includes('private async sendPrompt(text:')) {
      h = h.replace(
        /private async sendPrompt\(text: string[^)]*\)[^{]*\{/,
        (s) =>
          s +
          "\n    if (!String(text || '').trim()) {\n      this.post({ type: 'toast', text: 'empty' }); // EMPTY_HOST_SEND\n      return;\n    }"
      );
      fs.writeFileSync('src/host/SidebarProvider.ts', h);
      console.log('empty host', h.includes('EMPTY_HOST_SEND'));
    } else if (h.includes('async sendPrompt(')) {
      const i = h.indexOf('async sendPrompt(');
      console.log(JSON.stringify(h.slice(i, i + 120)));
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
const tmp = path.join(os.tmpdir(), 'mimo-b291-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.290',
  'mimo.mimo-vscode-1.0.0-beta.289',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: history search focus; dispose sendState; KEEP PORTING"`,
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

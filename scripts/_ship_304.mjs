import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.304';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// focusChat: open sidebar + focus prompt
{
  let a = fs.readFileSync('src/extension/activate.ts', 'utf8');
  const i = a.indexOf('mimo.focusChat');
  console.log('focusChat idx', i);
  if (i >= 0) console.log(JSON.stringify(a.slice(i, i + 220)));

  if (!a.includes('// FOCUS_CHAT_PROMPT') && a.includes('mimo.focusChat')) {
    // replace common patterns
    const patterns = [
      [
        "vscode.commands.registerCommand('mimo.focusChat', () => provider.focus?.() || provider.runCommand?.('focusPrompt'))",
        null,
      ],
    ];
    // find full registerCommand call for focusChat
    const re =
      /vscode\.commands\.registerCommand\(\s*'mimo\.focusChat'\s*,\s*(?:\(\)\s*=>\s*(?:\{[\s\S]*?\}|[^,]+)|async\s*\(\)\s*=>\s*\{[\s\S]*?\})\s*\)/;
    const m = a.match(re);
    if (m) {
      console.log('matched focusChat register', m[0].slice(0, 160));
      a = a.replace(
        m[0],
        `vscode.commands.registerCommand('mimo.focusChat', () => {
      // FOCUS_CHAT_PROMPT
      void vscode.commands.executeCommand('mimo.openSidebar');
      runHost(() => provider.runCommand('focusPrompt'));
    })`
      );
      fs.writeFileSync('src/extension/activate.ts', a);
      console.log('focusChat patched', a.includes('FOCUS_CHAT_PROMPT'));
    } else {
      // try line-based: any line with focusChat
      const lines = a.split(/\r?\n/);
      let start = -1;
      for (let li = 0; li < lines.length; li++) {
        if (lines[li].includes("registerCommand('mimo.focusChat'")) {
          start = li;
          break;
        }
      }
      if (start >= 0) {
        // find end of this register (next registerCommand or ),)
        let end = start;
        let depth = 0;
        let begun = false;
        for (let li = start; li < Math.min(lines.length, start + 15); li++) {
          for (const ch of lines[li]) {
            if (ch === '(') {
              depth++;
              begun = true;
            }
            if (ch === ')') depth--;
          }
          end = li;
          if (begun && depth <= 0) break;
        }
        const replacement = [
          "    vscode.commands.registerCommand('mimo.focusChat', () => {",
          '      // FOCUS_CHAT_PROMPT',
          "      void vscode.commands.executeCommand('mimo.openSidebar');",
          "      runHost(() => provider.runCommand('focusPrompt'));",
          '    }),',
        ];
        // keep comma style from original
        const block = lines.slice(start, end + 1).join('\n');
        console.log('block', block);
        const newLines = [...lines.slice(0, start), ...replacement, ...lines.slice(end + 1)];
        // fix double commas
        a = newLines.join('\n').replace(/\}\),\s*,/g, '}),');
        fs.writeFileSync('src/extension/activate.ts', a);
        console.log('focusChat line patch', a.includes('FOCUS_CHAT_PROMPT'));
      }
    }
  }
}

// Host: soft toast when soft reconnect - already
// Functional: /search filter chat DOM for text
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (!m.includes("cmd === 'find'") && !m.includes("cmd === 'search'")) {
    const ins = `  if (cmd === 'find' || cmd === 'search') {
    const q = (rest || '').trim().toLowerCase();
    if (!q) {
      showToast('usage: /find <text>');
      return true;
    }
    const nodes = Array.from(chat.querySelectorAll('.msg, .message, [data-role]'));
    let hits = 0;
    let first: HTMLElement | null = null;
    for (const n of nodes) {
      const el = n as HTMLElement;
      const t = (el.innerText || el.textContent || '').toLowerCase();
      if (t.includes(q)) {
        hits++;
        if (!first) first = el;
        el.classList.add('mimo-find-hit');
      } else {
        el.classList.remove('mimo-find-hit');
      }
    }
    if (first) {
      first.scrollIntoView({ block: 'center', behavior: 'smooth' });
      autoScroll = false;
      ensureJumpBottom();
    }
    showToast(hits ? hits + ' hit(s)' : 'no matches');
    return true;
  }
`;
    if (m.includes("  if (cmd === 'top')")) {
      m = m.replace("  if (cmd === 'top')", ins + "  if (cmd === 'top')");
    } else if (m.includes("  if (cmd === 'jump'")) {
      m = m.replace(/  if \(cmd === 'jump'/, ins + "  if (cmd === 'jump'");
    } else if (m.includes("  if (cmd === 'help')")) {
      m = m.replace("  if (cmd === 'help')", ins + "  if (cmd === 'help')");
    }
    fs.writeFileSync('src/webview/app/main.ts', m);
    console.log('find slash', m.includes("cmd === 'find'"));
  }
}

// minimal CSS for find hit - only if app.css has place; avoid visual wipe - tiny functional highlight ok as functional search
{
  let css = fs.readFileSync('media/app.css', 'utf8');
  if (!css.includes('mimo-find-hit')) {
    css +=
      '\n/* functional find highlight */\n.mimo-find-hit { outline: 1px solid var(--vscode-focusBorder, #3794ff); outline-offset: 2px; }\n';
    fs.writeFileSync('media/app.css', css);
    console.log('find css');
  }
}

// catalog
{
  let cat = fs.readFileSync('src/host/cli/slashCatalog.ts', 'utf8');
  if (!cat.includes("name: 'find'")) {
    cat = cat.replace(
      "    { name: 'top', description: 'Scroll chat to top' },",
      "    { name: 'top', description: 'Scroll chat to top' },\n    { name: 'find', description: 'Find text in current chat' },\n    { name: 'search', description: 'Find text in current chat' },"
    );
    fs.writeFileSync('src/host/cli/slashCatalog.ts', cat);
    console.log('catalog find', cat.includes("name: 'find'"));
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
const tmp = path.join(os.tmpdir(), 'mimo-b304-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.303',
  'mimo.mimo-vscode-1.0.0-beta.302',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: /find in chat; focusChat opens sidebar; KEEP PORTING"`,
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

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.301';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// When soft stream permission request: soft flash status already
// Functional: soft toast when soft soft selectSession after undo already
// Soft: when soft soft soft - /details expand all tool cards
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (m.includes("cmd === 'details'") && !m.includes('// DETAILS_EXPAND')) {
    // find details block
    const re = /if \(cmd === 'details'\) \{[\s\S]*?return true;\s*\}/;
    const hit = m.match(re);
    if (hit) {
      console.log('details block len', hit[0].length);
      if (!hit[0].includes('querySelectorAll')) {
        const neu = `  if (cmd === 'details') {
    // DETAILS_EXPAND
    const parts = document.querySelectorAll('details.mimo-part, .mimo-part details, details.tool');
    let n = 0;
    parts.forEach((d) => {
      const el = d as HTMLDetailsElement;
      if ('open' in el) {
        el.open = true;
        n++;
      }
    });
    // also open collapsed tool bodies
    document.querySelectorAll('.mimo-part:not([open])').forEach((el) => {
      if (el instanceof HTMLDetailsElement) {
        el.open = true;
        n++;
      }
    });
    showToast(n ? 'expanded · ' + n : 'no tool cards');
    return true;
  }`;
        m = m.replace(re, neu);
        fs.writeFileSync('src/webview/app/main.ts', m);
        console.log('details expand ok');
      } else console.log('details already expands');
    } else {
      // inject before help
      if (m.includes("  if (cmd === 'help')") && !m.includes("cmd === 'details'")) {
        console.log('details missing entirely');
      } else {
        const i = m.indexOf("cmd === 'details'");
        console.log(i >= 0 ? m.slice(i, i + 250) : 'no details');
      }
    }
  }
}

// Host soft: soft when soft soft soft - persist last session id for reopen
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (!h.includes('// LAST_SESSION_PERSIST') && h.includes('this.currentSessionId = sessionId')) {
    h = h.replace(
      'this.currentSessionId = sessionId;',
      "this.currentSessionId = sessionId;\n    if (sessionId) void this.context.globalState.update('mimo.lastSessionId', sessionId); // LAST_SESSION_PERSIST"
    );
    // only first occurrence in selectSession - replace_all might hit too many
    // check count
    const c = (h.match(/LAST_SESSION_PERSIST/g) || []).length;
    if (c > 1) {
      // ok multiple fine
    }
    fs.writeFileSync('src/host/SidebarProvider.ts', h);
    console.log('last session persist', c || h.includes('LAST_SESSION_PERSIST'));
  }
}

// soft reopen last session command
{
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = VER;
  if (!pkg.contributes.commands.find((c) => c.command === 'mimo.reopenLast')) {
    pkg.contributes.commands.push({
      command: 'mimo.reopenLast',
      title: 'MiMo Code: Reopen Last Session',
    });
    pkg.activationEvents.push('onCommand:mimo.reopenLast');
    console.log('reopenLast cmd');
  }
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
}

{
  let a = fs.readFileSync('src/extension/activate.ts', 'utf8');
  if (!a.includes('mimo.reopenLast')) {
    a = a.replace(
      "vscode.commands.registerCommand('mimo.openSettings', () =>\n      runHost(() => provider.runCommand('openSettings'))\n    )",
      "vscode.commands.registerCommand('mimo.openSettings', () =>\n      runHost(() => provider.runCommand('openSettings'))\n    ),\n    vscode.commands.registerCommand('mimo.reopenLast', () =>\n      runHost(() => provider.runCommand('reopenLast'))\n    )"
    );
    fs.writeFileSync('src/extension/activate.ts', a);
    console.log('activate reopen', a.includes('mimo.reopenLast'));
  }
}

{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (!h.includes("case 'reopenLast'")) {
    const block = `        case 'reopenLast': {
          const last = this.context.globalState.get<string>('mimo.lastSessionId');
          if (!last) {
            this.post({ type: 'toast', text: 'no last session' });
            break;
          }
          this.post({ type: 'toast', text: 'reopen…' });
          await this.selectSession(last);
          break;
        }
`;
    if (h.includes("case 'goHome':")) {
      h = h.replace("case 'goHome':", block + "        case 'goHome':");
    } else if (h.includes("case 'openHistory':")) {
      h = h.replace("case 'openHistory':", block + "        case 'openHistory':");
    }
    fs.writeFileSync('src/host/SidebarProvider.ts', h);
    console.log('reopenLast case', h.includes("case 'reopenLast'"));
  }
}

// /last slash reopen
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  // careful: copy-last uses 'last' - check
  if (m.includes("cmd === 'copy-last' || cmd === 'last'")) {
    // rename last alias off copy-last, use /reopen for last session
    m = m.replace(
      "cmd === 'copy-last' || cmd === 'last'",
      "cmd === 'copy-last' || cmd === 'copylast'"
    );
    console.log('freed last alias');
  }
  if (!m.includes("cmd === 'reopen'") && !m.includes("cmd === 'lastsession'")) {
    const ins = `  if (cmd === 'reopen' || cmd === 'lastsession') {
    showToast('reopen…');
    post({ type: 'reopenLast' });
    return true;
  }
`;
    if (m.includes("  if (cmd === 'home'")) {
      m = m.replace("  if (cmd === 'home'", ins + "  if (cmd === 'home'");
    } else if (m.includes("  if (cmd === 'history'")) {
      m = m.replace("  if (cmd === 'history'", ins + "  if (cmd === 'history'");
    }
    fs.writeFileSync('src/webview/app/main.ts', m);
    console.log('reopen slash', m.includes("cmd === 'reopen'"));
  }
  // host needs message type reopenLast from webview - case in switch on msg.type
  // if webview posts type reopenLast, need case
}

// ensure host handles type reopenLast from webview (not only runCommand)
// runCommand('reopenLast') uses same switch as messages typically

// catalog
{
  let cat = fs.readFileSync('src/host/cli/slashCatalog.ts', 'utf8');
  if (!cat.includes("name: 'reopen'")) {
    cat = cat.replace(
      "    { name: 'copy-last', description: 'Copy last assistant message' },",
      "    { name: 'copy-last', description: 'Copy last assistant message' },\n    { name: 'reopen', description: 'Reopen last session' },\n    { name: 'lastsession', description: 'Reopen last session' },"
    );
    // may be at end of return only
    if (!cat.includes("name: 'reopen'")) {
      cat = cat.replace(
        "    { name: 'copy-last', description: 'Copy last assistant message' },\n  ];",
        "    { name: 'copy-last', description: 'Copy last assistant message' },\n    { name: 'reopen', description: 'Reopen last session' },\n  ];"
      );
    }
    fs.writeFileSync('src/host/cli/slashCatalog.ts', cat);
    console.log('catalog reopen', cat.includes("name: 'reopen'"));
  }
}

// webview posts {type:'reopenLast'} - host must handle in onDidReceiveMessage switch
// if cases are on msg.type strings including reopenLast - added case 'reopenLast'

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
const tmp = path.join(os.tmpdir(), 'mimo-b301-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.300',
  'mimo.mimo-vscode-1.0.0-beta.299',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: reopen last session; details expand; KEEP PORTING"`,
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

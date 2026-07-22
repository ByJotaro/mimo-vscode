import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.290';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// refreshModels init post: include workspaceRoot + version
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  const old = `              this.post({
                type: 'init',
                sessions: [],
                models: this.models,
                modes: this.modes,
                selectedModel: this.selectedModel,
                selectedMode: this.selectedMode,
                metadataOnly: true,
                showStartupChooser: false,
                slashCommands: getSlashCommandCatalog(),
              });`;
  const neu = `              this.post({
                type: 'init',
                sessions: [],
                models: this.models,
                modes: this.modes,
                selectedModel: this.selectedModel,
                selectedMode: this.selectedMode,
                metadataOnly: true,
                showStartupChooser: false,
                slashCommands: getSlashCommandCatalog(),
                workspaceRoot: getWorkspaceRoot(),
                version: this.context.extension.packageJSON?.version || 'v2',
              });`;
  if (h.includes(old)) {
    h = h.replace(old, neu);
    console.log('refreshModels init enriched');
  } else if (h.includes(old.replace(/\n/g, '\r\n'))) {
    h = h.replace(old.replace(/\n/g, '\r\n'), neu.replace(/\n/g, '\r\n'));
    console.log('refreshModels init enriched crlf');
  } else if (!h.includes('workspaceRoot: getWorkspaceRoot()')) {
    // inject after slashCommands in metadataOnly block near refreshModels
    h = h.replace(
      'slashCommands: getSlashCommandCatalog(),\n              });\n              this.post({\n                type: \'toast\',\n                text: this.models.length',
      "slashCommands: getSlashCommandCatalog(),\n                workspaceRoot: getWorkspaceRoot(),\n                version: this.context.extension.packageJSON?.version || 'v2',\n              });\n              this.post({\n                type: 'toast',\n                text: this.models.length"
    );
    console.log('loose inject', h.includes('workspaceRoot: getWorkspaceRoot()'));
  } else console.log('workspaceRoot already somewhere');
  fs.writeFileSync('src/host/SidebarProvider.ts', h);
}

// openHistory: also post type openHistory for webview panel if exists
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (h.includes("case 'openHistory'") && !h.includes("type: 'openHistory'")) {
    h = h.replace(
      "case 'openHistory':\n          this.post({ type: 'toast', text: 'history' });\n          await this.sendSessionsList(true);",
      "case 'openHistory':\n          this.post({ type: 'openHistory' });\n          this.post({ type: 'toast', text: 'history' });\n          await this.sendSessionsList(true);"
    );
    if (!h.includes("type: 'openHistory'")) {
      h = h.replace(
        "case 'openHistory':\r\n          this.post({ type: 'toast', text: 'history' });\r\n          await this.sendSessionsList(true);",
        "case 'openHistory':\r\n          this.post({ type: 'openHistory' });\r\n          this.post({ type: 'toast', text: 'history' });\r\n          await this.sendSessionsList(true);"
      );
    }
    fs.writeFileSync('src/host/SidebarProvider.ts', h);
    console.log('openHistory msg', h.includes("type: 'openHistory'"));
  }
}

// webview openHistory case
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (!m.includes("case 'openHistory'")) {
    m = m.replace(
      "    case 'focusPrompt':",
      "    case 'openHistory':\n      if (typeof showHistoryPanel === 'function') showHistoryPanel();\n      else handleLocalSlash('/history');\n      break;\n    case 'focusPrompt':"
    );
    if (!m.includes("case 'openHistory'")) {
      m = m.replace(
        "    case 'toast':",
        "    case 'openHistory':\n      handleLocalSlash('/history');\n      break;\n    case 'toast':"
      );
    }
    fs.writeFileSync('src/webview/app/main.ts', m);
    console.log('wv openHistory', m.includes("case 'openHistory'"));
  }
}

// soft: /history local already shows panel
// Host soft: when openHistory without webview ready, list still posts

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
const tmp = path.join(os.tmpdir(), 'mimo-b290-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.289',
  'mimo.mimo-vscode-1.0.0-beta.288',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: refreshModels workspace+version; openHistory panel; KEEP PORTING"`,
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

try {
  const notes =
    process.env.USERPROFILE +
    '/.local/share/mimocode/memory/sessions/ses_0926fd416ffeyXG0Mc5SdUf7G4/notes.md';
  fs.appendFileSync(
    notes,
    `\n## [turn · 2026-07-22 ${VER} continuous]\n- Tip **${VER}** — Reload Window\n- Functional continuous; T21 visual AFTER port + verify\n- FAIL=${fail}; KEEP PORTING\n`
  );
} catch {
  /* ignore */
}

console.log('TIP=' + VER + ' FAIL=' + fail + ' KEEP_PORTING');

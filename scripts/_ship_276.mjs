import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const VER = '1.0.0-beta.276';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' };
function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env });
}

// When soft resync after streamDone, webview already soft; host also soft 258
// Functional: /btw with rest appends as side question with prefix
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  // remove btw from forward list and handle locally with prefix
  if (m.includes("cmd === 'btw'") && m.includes("cmd === 'compact'")) {
    // currently in forward list - extract to local
    m = m.replace(/^\s*cmd === 'btw' \|\|\r?\n/m, '');
    if (!m.includes("if (cmd === 'btw')")) {
      const ins = `  if (cmd === 'btw') {
    const q = rest || '';
    if (!q) {
      showToast('usage: /btw <side question>');
      return true;
    }
    showToast('btw…');
    post({
      type: 'sendPrompt',
      text: '/btw ' + q,
      sessionId: activeSessionId || undefined,
      mode: selectedMode,
      model: selectedModel || undefined,
    });
    return true;
  }
`;
      if (m.includes("  if (cmd === 'reload'")) {
        m = m.replace("  if (cmd === 'reload'", ins + "  if (cmd === 'reload'");
      } else if (m.includes("  if (cmd === 'retry')")) {
        m = m.replace("  if (cmd === 'retry')", ins + "  if (cmd === 'retry')");
      }
    }
    fs.writeFileSync('src/webview/app/main.ts', m);
    console.log('btw local', m.includes("if (cmd === 'btw')"));
  } else console.log('btw skip');
}

// When permission reply reject - soft resync already
// Soft: ensure workspaceRoot sent on metadataOnly init too
{
  let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
  if (h.includes('metadataOnly: true') && !h.includes('workspaceRoot: getWorkspaceRoot()')) {
    // refreshModels post init
    const old = `this.post({
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
    const neu = `this.post({
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
              });`;
    if (h.includes(old)) {
      h = h.replace(old, neu);
      console.log('metadata workspace ok');
    } else if (h.includes(old.replace(/\n/g, '\r\n'))) {
      h = h.replace(old.replace(/\n/g, '\r\n'), neu.replace(/\n/g, '\r\n'));
      console.log('metadata workspace crlf');
    } else {
      // looser: add after slashCommands line in metadataOnly block only once
      if (h.includes('metadataOnly: true') && !h.includes('workspaceRoot: getWorkspaceRoot()')) {
        h = h.replace(
          'slashCommands: getSlashCommandCatalog(),\n              });\n            } catch (e) {\n              this.log.appendLine(\'[refreshModels]',
          'slashCommands: getSlashCommandCatalog(),\n                workspaceRoot: getWorkspaceRoot(),\n              });\n            } catch (e) {\n              this.log.appendLine(\'[refreshModels]'
        );
        console.log('metadata loose', h.includes('workspaceRoot: getWorkspaceRoot()'));
      }
    }
    fs.writeFileSync('src/host/SidebarProvider.ts', h);
  } else console.log('ws root ok or exists');
}

// /about alias of /status card denser
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  if (!m.includes("cmd === 'about'")) {
    m = m.replace(
      "  if (cmd === 'cost' || cmd === 'status' || cmd === 'usage') {",
      "  if (cmd === 'about') {\n    handleLocalSlash('/port');\n    return true;\n  }\n  if (cmd === 'cost' || cmd === 'status' || cmd === 'usage') {"
    );
    fs.writeFileSync('src/webview/app/main.ts', m);
    console.log('about', m.includes("cmd === 'about'"));
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
const tmp = path.join(os.tmpdir(), 'mimo-b276-' + Math.random().toString(36).slice(2, 8));
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
  'mimo.mimo-vscode-1.0.0-beta.275',
  'mimo.mimo-vscode-1.0.0-beta.274',
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
    `git -c user.email=jotaro@local -c user.name=ByJotaro commit -m "v2 ${VER}: /btw local; /about; workspaceRoot on models refresh; KEEP PORTING"`,
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

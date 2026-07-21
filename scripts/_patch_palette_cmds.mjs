import fs from 'fs';

const p = 'src/host/SidebarProvider.ts';
let c = fs.readFileSync(p, 'utf8');

// 1) runCommand public API
if (!c.includes('async runCommand')) {
  const anchor = `  private post(msg: unknown): void {
    void this.view?.webview.postMessage(msg);
  }`;
  if (!c.includes(anchor)) {
    console.error('post anchor miss');
    process.exit(1);
  }
  c = c.replace(
    anchor,
    `  private post(msg: unknown): void {
    void this.view?.webview.postMessage(msg);
  }

  /** Command palette / external entry — reuses webview message handlers. */
  async runCommand(type: string, extra?: Record<string, unknown>): Promise<void> {
    await this.onMessage({ type, ...(extra || {}) });
  }`
  );
  console.log('runCommand ok');
} else console.log('runCommand exists');

// 2) openHistory
if (!c.includes("case 'openHistory'")) {
  if (!c.includes("case 'goHome':")) {
    console.error('goHome miss');
    process.exit(1);
  }
  c = c.replace(
    "case 'goHome':",
    `case 'openHistory':
          this.post({ type: 'toast', text: 'history' });
          await this.sendSessionsList(true);
          break;
        case 'goHome':`
  );
  console.log('openHistory ok');
} else console.log('openHistory exists');

// 3) fix insertEditorSelection if broken (missing backticks)
const i = c.indexOf("case 'insertEditorSelection'");
if (i >= 0) {
  const slice = c.slice(i, i + 700);
  if (slice.includes("const header = '' + file") || slice.includes("header + '\\n`\\n'")) {
    // replace whole case block carefully until next case
    const start = i;
    const next = c.indexOf("case 'openFolder'", start);
    const end = next > start ? next : c.indexOf("case 'openFilePath'", start);
    if (end < 0) {
      console.error('end case miss');
      process.exit(1);
    }
    const block = `case 'insertEditorSelection': {
          const ed = vscode.window.activeTextEditor;
          if (!ed) {
            this.post({ type: 'toast', text: 'no active editor' });
            break;
          }
          const sel = ed.document.getText(ed.selection);
          if (!sel.trim()) {
            this.post({ type: 'toast', text: 'empty selection' });
            break;
          }
          const file = ed.document.uri.fsPath;
          const start = ed.selection.start.line + 1;
          const end = ed.selection.end.line + 1;
          const header =
            '\`' + file + ':' + start + (end !== start ? '-' + end : '') + '\`';
          this.post({
            type: 'insertPromptText',
            text: header + '\\n\`\`\`\\n' + sel + '\\n\`\`\`\\n',
          });
          break;
        }
        `;
    c = c.slice(0, start) + block + c.slice(end);
    console.log('selection fixed');
  } else {
    console.log('selection looks ok', JSON.stringify(slice.slice(0, 200)));
  }
}

// sanity: file must end with class close
const tail = c.trimEnd().slice(-40);
console.log('tail', JSON.stringify(tail));
if (!c.trimEnd().endsWith('}')) {
  console.error('file structure broken');
  process.exit(1);
}

fs.writeFileSync(p, c);
console.log('written', c.length);

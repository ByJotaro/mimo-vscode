import fs from 'fs';

const p = 'src/host/SidebarProvider.ts';
let c = fs.readFileSync(p, 'utf8');

const re = /case 'insertEditorSelection': \{[\s\S]*?break;\s*\}/;
const fixed = `case 'insertEditorSelection': {
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
        }`;

if (re.test(c)) {
  c = c.replace(re, fixed);
  console.log('selection fixed');
} else console.log('selection pattern miss');

if (!c.includes("case 'openHistory'")) {
  c = c.replace(
    "case 'goHome':",
    "case 'openHistory':\n          this.post({ type: 'toast', text: 'history' });\n          await this.sendSessionsList(true);\n          break;\n        case 'goHome':"
  );
  console.log('openHistory ok');
} else console.log('openHistory exists');

if (!c.includes('async runCommand')) {
  c = c.replace(
    'private post(msg: unknown): void {\n    void this.view?.webview.postMessage(msg);\n  }',
    "private post(msg: unknown): void {\n    void this.view?.webview.postMessage(msg);\n  }\n\n  /** Command palette / external entry */\n  async runCommand(type: string, extra?: Record<string, unknown>): Promise<void> {\n    await this.onMessage({ type, ...(extra || {}) });\n  }"
  );
  console.log('runCommand inject');
} else console.log('runCommand exists');

fs.writeFileSync(p, c);
console.log('done');

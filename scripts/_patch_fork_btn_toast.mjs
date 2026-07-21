import fs from 'fs';

const p = 'src/webview/app/main.ts';
let c = fs.readFileSync(p, 'utf8');
const old = "btnFork?.addEventListener('click', () => post({ type: 'forkSession' }));";
const neu =
  "btnFork?.addEventListener('click', () => {\n  showToast('forking…');\n  post({ type: 'forkSession' });\n});";
if (c.includes(old)) {
  c = c.replace(old, neu);
  console.log('ok');
} else if (c.includes("showToast('forking")) {
  console.log('already');
} else {
  console.log('miss');
  process.exit(1);
}
// undo button toast soft
const u = "btnUndo?.addEventListener('click', () => post({ type: 'undoLast' }));";
const un =
  "btnUndo?.addEventListener('click', () => {\n  showToast('undo…');\n  post({ type: 'undoLast' });\n});";
if (c.includes(u)) {
  c = c.replace(u, un);
  console.log('undo toast ok');
}
fs.writeFileSync(p, c);

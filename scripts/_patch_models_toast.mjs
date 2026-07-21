import fs from 'fs';

const p = 'src/webview/app/main.ts';
let c = fs.readFileSync(p, 'utf8');

if (!c.includes("showToast('models…')") && !c.includes('showToast("models')) {
  const a = `  if (cmd === 'models' || (cmd === 'model' && !rest)) {
    post({ type: 'refreshModels' });
    if (statusLabel) statusLabel.textContent = 'models…';
    return true;
  }`;
  const an = `  if (cmd === 'models' || (cmd === 'model' && !rest)) {
    showToast('models…');
    post({ type: 'refreshModels' });
    if (statusLabel) statusLabel.textContent = 'models…';
    return true;
  }`;
  if (c.includes(a)) {
    c = c.replace(a, an);
    console.log('models ok');
  } else if (c.includes(a.replace(/\n/g, '\r\n'))) {
    c = c.replace(a.replace(/\n/g, '\r\n'), an.replace(/\n/g, '\r\n'));
    console.log('models ok crlf');
  } else console.log('models miss');
}

if (!c.includes("showToast('model ·")) {
  const b = `    post({ type: 'setModel', model: selectedModel });
    return true;
  }
  if (cmd === 'undo' || cmd === 'redo') {`;
  const bn = `    post({ type: 'setModel', model: selectedModel });
    showToast('model · ' + selectedModel);
    return true;
  }
  if (cmd === 'undo' || cmd === 'redo') {`;
  if (c.includes(b)) {
    c = c.replace(b, bn);
    console.log('set model ok');
  } else if (c.includes(b.replace(/\n/g, '\r\n'))) {
    c = c.replace(b.replace(/\n/g, '\r\n'), bn.replace(/\n/g, '\r\n'));
    console.log('set model ok crlf');
  } else console.log('set model miss');
}

// undo/redo toast soft
const u = `  if (cmd === 'undo' || cmd === 'redo') {
    post({ type: cmd === 'undo' ? 'undoLast' : 'redoLast' });`;
const un = `  if (cmd === 'undo' || cmd === 'redo') {
    showToast(cmd + '…');
    post({ type: cmd === 'undo' ? 'undoLast' : 'redoLast' });`;
if (c.includes(u) && !c.includes("showToast(cmd + '…')")) {
  c = c.replace(u, un);
  console.log('undo redo toast ok');
} else if (c.includes(u.replace(/\n/g, '\r\n'))) {
  c = c.replace(u.replace(/\n/g, '\r\n'), un.replace(/\n/g, '\r\n'));
  console.log('undo redo toast ok crlf');
}

fs.writeFileSync(p, c);
console.log('done');

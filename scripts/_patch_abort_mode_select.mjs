import fs from 'fs';

const p = 'src/webview/app/main.ts';
let c = fs.readFileSync(p, 'utf8');

// Ctrl+. abort toast
const a = `  // Ctrl/Cmd+. → abort when busy
  if (k === '.' && busy) {
    e.preventDefault();
    post({ type: 'abort' });
  }
});`;
const an = `  // Ctrl/Cmd+. → abort when busy
  if (k === '.' && busy) {
    e.preventDefault();
    showToast('stopping…');
    post({ type: 'abort' });
  }
});`;
if (c.includes(a) && !c.includes("k === '.' && busy") || true) {
  if (c.includes("if (k === '.' && busy)") && !c.includes("if (k === '.' && busy) {\n    e.preventDefault();\n    showToast('stopping")) {
    const old = `  if (k === '.' && busy) {
    e.preventDefault();
    post({ type: 'abort' });
  }`;
    const neu = `  if (k === '.' && busy) {
    e.preventDefault();
    showToast('stopping…');
    post({ type: 'abort' });
  }`;
    if (c.includes(old)) {
      c = c.replace(old, neu);
      console.log('abort toast ok');
    } else if (c.includes(old.replace(/\n/g, '\r\n'))) {
      c = c.replace(old.replace(/\n/g, '\r\n'), neu.replace(/\n/g, '\r\n'));
      console.log('abort toast ok crlf');
    } else console.log('abort miss');
  } else console.log('abort skip');
}

// mode/model select change toasts
const m1 = `modeSelect?.addEventListener('change', () => {
  selectedMode = modeSelect.value;
  post({ type: 'setMode', mode: selectedMode });
});`;
const m1n = `modeSelect?.addEventListener('change', () => {
  selectedMode = modeSelect.value;
  showToast('mode · ' + selectedMode);
  post({ type: 'setMode', mode: selectedMode });
});`;
if (c.includes(m1)) {
  c = c.replace(m1, m1n);
  console.log('mode select ok');
} else if (c.includes(m1.replace(/\n/g, '\r\n'))) {
  c = c.replace(m1.replace(/\n/g, '\r\n'), m1n.replace(/\n/g, '\r\n'));
  console.log('mode select ok crlf');
} else console.log('mode select skip');

const m2 = `modelSelect?.addEventListener('change', () => {
  selectedModel = modelSelect.value;
  post({ type: 'setModel', model: selectedModel });
});`;
const m2n = `modelSelect?.addEventListener('change', () => {
  selectedModel = modelSelect.value;
  showToast('model · ' + selectedModel);
  post({ type: 'setModel', model: selectedModel });
});`;
if (c.includes(m2)) {
  c = c.replace(m2, m2n);
  console.log('model select ok');
} else if (c.includes(m2.replace(/\n/g, '\r\n'))) {
  c = c.replace(m2.replace(/\n/g, '\r\n'), m2n.replace(/\n/g, '\r\n'));
  console.log('model select ok crlf');
} else console.log('model select skip');

fs.writeFileSync(p, c);
console.log('done');

import fs from 'fs';

const p = 'src/webview/app/main.ts';
let c = fs.readFileSync(p, 'utf8');
if (c.includes("addEventListener('paste'")) {
  console.log('paste exists');
} else {
  const block = `
promptEl?.addEventListener('paste', (e) => {
  const text = e.clipboardData?.getData('text/plain') || '';
  if (!text) return;
  const lines = text.split(/\\r?\\n/).map((l) => l.trim()).filter(Boolean);
  const pathLike = lines.filter(
    (l) =>
      /^[A-Za-z]:[\\\\/]/.test(l) ||
      l.startsWith('\\\\\\\\') ||
      l.startsWith('file:') ||
      (l.startsWith('/') && l.includes('/') && !/\\s/.test(l))
  );
  if (pathLike.length >= 1 && pathLike.length === lines.length && lines.length <= 12) {
    e.preventDefault();
    const insert = pathLike
      .map((p) => '\`' + p.replace(/^file:\\/\\/\\//, '').replace(/^file:\\/\\//, '') + '\`')
      .join(' ');
    const el = promptEl!;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, start) + insert + el.value.slice(end);
    const caret = start + insert.length;
    el.setSelectionRange(caret, caret);
    autoResizePrompt();
    showToast(pathLike.length + ' path(s)');
  }
});
`;
  if (c.includes("btnSend?.addEventListener('click', doSend);")) {
    c = c.replace(
      "btnSend?.addEventListener('click', doSend);",
      "btnSend?.addEventListener('click', doSend);" + block
    );
    console.log('paste ok');
  } else {
    console.log('paste miss anchor');
    process.exit(1);
  }
}

// undo toast denser if host returns result
const host = 'src/host/SidebarProvider.ts';
let h = fs.readFileSync(host, 'utf8');
if (!h.includes("undo toast") && h.includes('runGitUndo')) {
  // leave if already has toast after undo
  if (!h.includes("showInformationMessage") && h.includes('private async runGitUndo')) {
    console.log('undo has method');
  }
}

fs.writeFileSync(p, c);
console.log('done');

import fs from 'fs';

const p = 'src/webview/app/main.ts';
let c = fs.readFileSync(p, 'utf8');
if (c.includes("showToast('history')")) {
  console.log('already');
  process.exit(0);
}

// history
c = c.replace(
  `if (e.shiftKey && k === 'h') {
    e.preventDefault();
    showHistoryPanel([{ id: '_loading', title: 'Loading…' }]);
    post({ type: 'fetchSessions', history: true });
    return;
  }`,
  `if (e.shiftKey && k === 'h') {
    e.preventDefault();
    showToast('history');
    showHistoryPanel([{ id: '_loading', title: 'Loading…' }]);
    post({ type: 'fetchSessions', history: true });
    return;
  }`
);

// new
c = c.replace(
  `if (e.shiftKey && k === 'n') {
    e.preventDefault();
    post({ type: 'newSession' });
    return;
  }`,
  `if (e.shiftKey && k === 'n') {
    e.preventDefault();
    showToast('new session');
    post({ type: 'newSession' });
    return;
  }`
);

// clear L
c = c.replace(
  `if (e.shiftKey && k === 'l') {
    e.preventDefault();
    handleLocalSlash('/clear');
    return;
  }`,
  `if (e.shiftKey && k === 'l') {
    e.preventDefault();
    handleLocalSlash('/clear');
    return;
  }`
);

// home U
c = c.replace(
  `if (e.shiftKey && k === 'u') {
    e.preventDefault();
    activeSessionId = '';
    titleEl.textContent = 'MiMo Code';
    document.getElementById('mimo-history-panel')?.remove();
    chat.innerHTML = '';
    showStartup([]);
    post({ type: 'goHome' });
    return;
  }`,
  `if (e.shiftKey && k === 'u') {
    e.preventDefault();
    showToast('home');
    activeSessionId = '';
    titleEl.textContent = 'MiMo Code';
    document.getElementById('mimo-history-panel')?.remove();
    chat.innerHTML = '';
    showStartup([]);
    post({ type: 'goHome' });
    return;
  }`
);

// Ctrl+Shift+Z → undo (extra hotkey for git undo)
if (!c.includes("k === 'z' && e.shiftKey")) {
  const abortBlock = `// Ctrl/Cmd+. → abort when busy
  if (k === '.' && busy) {
    e.preventDefault();
    post({ type: 'abort' });
  }`;
  const inject = `// Ctrl/Cmd+Shift+Z → undo last file changes
  if (e.shiftKey && k === 'z') {
    e.preventDefault();
    showToast('undo…');
    post({ type: 'undoLast' });
    return;
  }
  // Ctrl/Cmd+Shift+Y → redo
  if (e.shiftKey && k === 'y') {
    e.preventDefault();
    showToast('redo…');
    post({ type: 'redoLast' });
    return;
  }
  ${abortBlock}`;
  if (c.includes(abortBlock)) {
    c = c.replace(abortBlock, inject);
    console.log('undo redo hotkeys ok');
  } else {
    // crlf
    const ab = abortBlock.replace(/\n/g, '\r\n');
    if (c.includes(ab)) {
      c = c.replace(ab, inject.replace(/\n/g, '\r\n'));
      console.log('undo redo hotkeys ok crlf');
    } else console.log('abort block miss');
  }
}

fs.writeFileSync(p, c);
console.log('hotkey toasts done', c.includes("showToast('history')"));

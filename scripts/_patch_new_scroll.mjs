import fs from 'fs';

const p = 'src/webview/app/main.ts';
let c = fs.readFileSync(p, 'utf8');

// /new slash toast
const n1 = `  if (cmd === 'new') {
    post({ type: 'newSession' });`;
const n1n = `  if (cmd === 'new') {
    showToast('new session');
    post({ type: 'newSession' });`;
if (c.includes(n1) && !c.includes("if (cmd === 'new') {\n    showToast('new session')")) {
  c = c.replace(n1, n1n);
  console.log('new slash ok');
} else if (c.includes(n1.replace(/\n/g, '\r\n'))) {
  c = c.replace(n1.replace(/\n/g, '\r\n'), n1n.replace(/\n/g, '\r\n'));
  console.log('new slash ok crlf');
} else console.log('new slash skip');

// hotkey new session toast already has showToast('new session') - check
// startup btn-new
const n2 =
  "listWrap.querySelector('#btn-new')?.addEventListener('click', () => post({ type: 'newSession' }));";
const n2n =
  "listWrap.querySelector('#btn-new')?.addEventListener('click', () => {\n    showToast('new session');\n    post({ type: 'newSession' });\n  });";
if (c.includes(n2)) {
  c = c.replace(n2, n2n);
  console.log('btn-new ok');
}

// soft: when autoScroll false, show jump-bottom control once
if (!c.includes('mimo-jump-bottom')) {
  const onScroll = `function onScroll(): void {
  autoScroll = isNearBottom(chat);
  if (!activeSessionId) return;
  // Near top of chat → fetch older messages (CLI-style history)
  if (chat.scrollTop < 360) requestLoadMore(false);
}`;
  const onScrollNew = `function ensureJumpBottom(): void {
  let btn = document.getElementById('mimo-jump-bottom') as HTMLButtonElement | null;
  if (!btn) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'mimo-jump-bottom';
    btn.className = 'mimo-jump-bottom';
    btn.textContent = '↓ bottom';
    btn.hidden = true;
    btn.addEventListener('click', () => {
      autoScroll = true;
      scrollToBottom(chat, true);
      btn!.hidden = true;
    });
    document.body.appendChild(btn);
  }
  btn.hidden = autoScroll || isNearBottom(chat);
}
function onScroll(): void {
  autoScroll = isNearBottom(chat);
  ensureJumpBottom();
  if (!activeSessionId) return;
  // Near top of chat → fetch older messages (CLI-style history)
  if (chat.scrollTop < 360) requestLoadMore(false);
}`;
  if (c.includes(onScroll)) {
    c = c.replace(onScroll, onScrollNew);
    console.log('jump bottom ok');
  } else if (c.includes(onScroll.replace(/\n/g, '\r\n'))) {
    c = c.replace(onScroll.replace(/\n/g, '\r\n'), onScrollNew.replace(/\n/g, '\r\n'));
    console.log('jump bottom ok crlf');
  } else console.log('onScroll miss');
}

fs.writeFileSync(p, c);
console.log('done');

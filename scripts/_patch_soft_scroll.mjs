import fs from 'fs';

const p = 'src/webview/app/main.ts';
let c = fs.readFileSync(p, 'utf8');

// 1) renderMessages: accept soft flag, preserve scroll when soft
const oldSig =
  'function renderMessages(\n  messages: DisplayMessage[],\n  opts: { loadMore?: boolean; olderCount?: number; pinBottom?: boolean }\n): void {';
const newSig =
  'function renderMessages(\n  messages: DisplayMessage[],\n  opts: { loadMore?: boolean; olderCount?: number; pinBottom?: boolean; soft?: boolean }\n): void {';
if (c.includes(oldSig)) {
  c = c.replace(oldSig, newSig);
  console.log('sig ok');
} else if (c.includes(oldSig.replace(/\n/g, '\r\n'))) {
  c = c.replace(oldSig.replace(/\n/g, '\r\n'), newSig.replace(/\n/g, '\r\n'));
  console.log('sig ok crlf');
} else {
  console.log('sig miss');
}

const oldEnd = `  if (opts.loadMore) {
    preserveScrollOnPrepend(chat, prevH, prevT);
  } else if (opts.pinBottom !== false) {
    pinBottomUntilSettled(chat, 'sessionData');
  }
}`;
const newEnd = `  if (opts.loadMore) {
    preserveScrollOnPrepend(chat, prevH, prevT);
  } else if (opts.soft) {
    // soft resync after streamDone — keep viewport, no pin jump
    const delta = chat.scrollHeight - prevH;
    chat.scrollTop = Math.max(0, prevT + delta);
  } else if (opts.pinBottom !== false) {
    pinBottomUntilSettled(chat, 'sessionData');
  }
}`;
if (c.includes(oldEnd)) {
  c = c.replace(oldEnd, newEnd);
  console.log('end ok');
} else if (c.includes(oldEnd.replace(/\n/g, '\r\n'))) {
  c = c.replace(oldEnd.replace(/\n/g, '\r\n'), newEnd.replace(/\n/g, '\r\n'));
  console.log('end ok crlf');
} else {
  console.log('end miss');
}

// 2) sessionData: pass soft when meta.source is db-soft; single focus; no focus on soft
const oldSd = `      renderMessages(message.messages || [], {
        loadMore: meta.loadMore === true || meta.source === 'loadMore',
        olderCount: older,
        pinBottom: meta.pinBottom !== false && meta.source !== 'loadMore',
      });
      loadMoreInFlight = false;
      // focus after sessionData
      setTimeout(() => promptEl?.focus(), 50);
      setInputEnabled(true);
      setTimeout(() => promptEl?.focus(), 40);
      break;`;
const newSd = `      const soft = meta.source === 'db-soft' || meta.soft === true;
      renderMessages(message.messages || [], {
        loadMore: meta.loadMore === true || meta.source === 'loadMore',
        olderCount: older,
        pinBottom: !soft && meta.pinBottom !== false && meta.source !== 'loadMore',
        soft,
      });
      loadMoreInFlight = false;
      setInputEnabled(true);
      // focus after full load only (soft resync keeps caret/focus)
      if (!soft) setTimeout(() => promptEl?.focus(), 40);
      break;`;
if (c.includes(oldSd)) {
  c = c.replace(oldSd, newSd);
  console.log('sessionData ok');
} else if (c.includes(oldSd.replace(/\n/g, '\r\n'))) {
  c = c.replace(oldSd.replace(/\n/g, '\r\n'), newSd.replace(/\n/g, '\r\n'));
  console.log('sessionData ok crlf');
} else {
  console.log('sessionData miss');
  const i = c.indexOf("case 'sessionData'");
  console.log(JSON.stringify(c.slice(i, i + 700)));
}

// 3) fix copy handler indentation noise
c = c.replace(
  `            showToast('copied');
        statusLabel.textContent = 'copied';
            statusLabel.classList.add('is-flash');`,
  `            showToast('copied');
            statusLabel.textContent = 'copied';
            statusLabel.classList.add('is-flash');`
);
c = c.replace(
  `            showToast('copied');\r\n        statusLabel.textContent = 'copied';\r\n            statusLabel.classList.add('is-flash');`,
  `            showToast('copied');\r\n            statusLabel.textContent = 'copied';\r\n            statusLabel.classList.add('is-flash');`
);

fs.writeFileSync(p, c);
console.log('written');

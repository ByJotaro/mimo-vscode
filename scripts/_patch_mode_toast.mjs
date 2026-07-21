import fs from 'fs';

const p = 'src/webview/app/main.ts';
let c = fs.readFileSync(p, 'utf8');

const old = `      post({ type: 'setMode', mode: selectedMode });
      if (statusLabel) statusLabel.textContent = 'mode ' + selectedMode;
    } else if (modeSelect) {
      modeSelect.focus();
    }
    return true;
  }
  if (cmd === 'sessions' || cmd === 'history') {`;

const neu = `      post({ type: 'setMode', mode: selectedMode });
      showToast('mode · ' + selectedMode);
      if (statusLabel) statusLabel.textContent = 'mode ' + selectedMode;
    } else if (modeSelect) {
      modeSelect.focus();
      showToast('pick mode');
    }
    return true;
  }
  if (cmd === 'sessions' || cmd === 'history') {
    showToast('history');`;

// careful: sessions already may have showHistoryPanel next
const neu2 = `      post({ type: 'setMode', mode: selectedMode });
      showToast('mode · ' + selectedMode);
      if (statusLabel) statusLabel.textContent = 'mode ' + selectedMode;
    } else if (modeSelect) {
      modeSelect.focus();
      showToast('pick mode');
    }
    return true;
  }
  if (cmd === 'sessions' || cmd === 'history') {`;

if (c.includes("showToast('mode · ")) {
  console.log('mode already');
} else if (c.includes(old)) {
  c = c.replace(old, neu2);
  console.log('mode ok');
} else if (c.includes(old.replace(/\n/g, '\r\n'))) {
  c = c.replace(old.replace(/\n/g, '\r\n'), neu2.replace(/\n/g, '\r\n'));
  console.log('mode ok crlf');
} else {
  // minimal inject
  const m = "if (statusLabel) statusLabel.textContent = 'mode ' + selectedMode;";
  if (c.includes(m) && !c.includes("showToast('mode")) {
    c = c.replace(m, "showToast('mode · ' + selectedMode);\n      " + m);
    console.log('mode loose ok');
  } else {
    console.log('mode miss');
  }
}

// history slash toast once
const h = `  if (cmd === 'sessions' || cmd === 'history') {
    showHistoryPanel([{ id: '_loading', title: 'Loading…' }]);
    post({ type: 'fetchSessions', history: true });
    return true;
  }`;
const hn = `  if (cmd === 'sessions' || cmd === 'history') {
    showToast('history');
    showHistoryPanel([{ id: '_loading', title: 'Loading…' }]);
    post({ type: 'fetchSessions', history: true });
    return true;
  }`;
if (c.includes(h) && !c.includes("if (cmd === 'sessions' || cmd === 'history') {\n    showToast('history')")) {
  c = c.replace(h, hn);
  console.log('history toast ok');
} else if (c.includes(h.replace(/\n/g, '\r\n'))) {
  c = c.replace(h.replace(/\n/g, '\r\n'), hn.replace(/\n/g, '\r\n'));
  console.log('history toast ok crlf');
} else console.log('history toast skip');

fs.writeFileSync(p, c);
console.log('done');

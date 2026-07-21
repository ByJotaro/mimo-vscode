import fs from 'fs';

const p = 'src/webview/app/main.ts';
let c = fs.readFileSync(p, 'utf8');
if (c.includes("titleEl.classList.add('is-live')")) {
  console.log('already');
  process.exit(0);
}
const old = `case 'sessionTitle': {
      const t = String(message.title || '').trim();
      if (t && (!message.sessionId || message.sessionId === activeSessionId)) {
        titleEl.textContent = t;
      }
      break;
    }`;
const neu = `case 'sessionTitle': {
      const t = String(message.title || '').trim();
      if (t && (!message.sessionId || message.sessionId === activeSessionId)) {
        titleEl.textContent = t;
        titleEl.classList.add('is-live');
        setTimeout(() => titleEl.classList.remove('is-live'), 900);
      }
      break;
    }`;
if (c.includes(old)) {
  c = c.replace(old, neu);
  console.log('ok');
} else if (c.includes(old.replace(/\n/g, '\r\n'))) {
  c = c.replace(old.replace(/\n/g, '\r\n'), neu.replace(/\n/g, '\r\n'));
  console.log('ok crlf');
} else {
  console.log('miss');
  const i = c.indexOf("case 'sessionTitle'");
  console.log(JSON.stringify(c.slice(i, i + 280)));
  process.exit(1);
}
fs.writeFileSync(p, c);

import fs from 'fs';

const p = 'src/webview/app/main.ts';
let c = fs.readFileSync(p, 'utf8');
if (c.includes('// streamDone resync')) {
  console.log('already');
  process.exit(0);
}
// After streamDone message.text append, add delayed resync of session from host
const needle = `if (message.text) {
        appendOrUpdateMessage({
          id: message.messageId || 'live',
          role: 'assistant',
          text: message.text,
        });
      }
      break;
    case 'sendState':`;
const needleCrlf = needle.replace(/\n/g, '\r\n');
let i = c.indexOf(needle);
let n = needle;
if (i < 0) {
  i = c.indexOf(needleCrlf);
  n = needleCrlf;
}
if (i < 0) {
  console.log('miss');
  // looser: just before case sendState after streamDone
  const j = c.indexOf("case 'sendState':");
  const k = c.lastIndexOf("case 'streamDone':", j);
  console.log('streamDone at', k, 'sendState at', j);
  process.exit(1);
}
const inject = n.includes('\r\n')
  ? `if (message.text) {
        appendOrUpdateMessage({
          id: message.messageId || 'live',
          role: 'assistant',
          text: message.text,
        });
      }
      // streamDone resync — pull finalized tools from host after short settle
      if (activeSessionId) {
        setTimeout(() => {
          if (activeSessionId && !busy) {
            post({ type: 'selectSession', sessionId: activeSessionId, soft: true });
          }
        }, 400);
      }
      break;
    case 'sendState':`
  : `if (message.text) {
        appendOrUpdateMessage({
          id: message.messageId || 'live',
          role: 'assistant',
          text: message.text,
        });
      }
      // streamDone resync — pull finalized tools from host after short settle
      if (activeSessionId) {
        setTimeout(() => {
          if (activeSessionId && !busy) {
            post({ type: 'selectSession', sessionId: activeSessionId, soft: true });
          }
        }, 400);
      }
      break;
    case 'sendState':`;
// Fix inject to use correct newlines
const injectFixed = inject.replace(/\r\n/g, '\n');
const use =
  n.includes('\r\n') ? injectFixed.replace(/\n/g, '\r\n') : injectFixed;
c = c.slice(0, i) + use + c.slice(i + n.length);
fs.writeFileSync(p, c);
console.log('ok');

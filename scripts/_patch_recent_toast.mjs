import fs from 'fs';

const p = 'src/webview/app/main.ts';
let c = fs.readFileSync(p, 'utf8');

// Toast when opening a recent session from startup list
// Two places around selectSession in startup/history
let count = 0;
const needle = "post({ type: 'selectSession', sessionId: s.id });";
if (c.includes(needle) && !c.includes("showToast('open session')") && !c.includes("showToast('opening…')")) {
  // Only wrap the ones that are not soft resync - replace all simple selectSession with s.id
  c = c.split(needle).join("showToast('opening…', 900);\n      post({ type: 'selectSession', sessionId: s.id });");
  // avoid double on soft paths - soft uses activeSessionId not s.id
  count = (c.match(/showToast\('opening…'/g) || []).length;
  console.log('wrapped', count);
} else {
  console.log('skip or already');
}
fs.writeFileSync(p, c);

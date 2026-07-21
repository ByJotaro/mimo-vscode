import fs from 'fs';

const p = 'src/webview/app/main.ts';
const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
let changed = false;

for (let i = 0; i < lines.length; i++) {
  // after preventDefault on shift+h history
  if (
    lines[i].includes("k === 'h'") &&
    lines[i + 1]?.includes('preventDefault') &&
    !lines[i + 2]?.includes("showToast('history')")
  ) {
    const indent = lines[i + 1].match(/^\s*/)[0];
    lines.splice(i + 2, 0, `${indent}showToast('history');`);
    changed = true;
    i += 2;
  }
  if (
    lines[i].includes("k === 'n'") &&
    lines[i + 1]?.includes('preventDefault') &&
    !lines[i + 2]?.includes("showToast('new")
  ) {
    const indent = lines[i + 1].match(/^\s*/)[0];
    lines.splice(i + 2, 0, `${indent}showToast('new session');`);
    changed = true;
    i += 2;
  }
  if (
    lines[i].includes("k === 'u'") &&
    lines[i + 1]?.includes('preventDefault') &&
    !lines[i + 2]?.includes("showToast('home')")
  ) {
    const indent = lines[i + 1].match(/^\s*/)[0];
    lines.splice(i + 2, 0, `${indent}showToast('home');`);
    changed = true;
    i += 2;
  }
}

fs.writeFileSync(p, lines.join('\n'));
console.log(changed ? 'ok' : 'no change');

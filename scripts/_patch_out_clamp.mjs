import fs from 'fs';

const p = 'src/webview/app/main.ts';
let c = fs.readFileSync(p, 'utf8');

// Clamp long OUT (non-diff) similar to IN
const old = `  if (out) {
    const outLab = isDiff ? 'diff' : 'out';
    bodyHtml += \`<div class="mimo-io-line mimo-io-line--out"><span class="mimo-io-k">\${outLab}</span>\${
      isDiff ? renderDiffOut(out) : \`<pre class="mimo-io-v">\${escHtml(out)}</pre>\`
    }</div>\`;
  }`;

const neu = `  if (out) {
    const outLab = isDiff ? 'diff' : 'out';
    if (isDiff) {
      bodyHtml += \`<div class="mimo-io-line mimo-io-line--out"><span class="mimo-io-k">\${outLab}</span>\${renderDiffOut(out)}</div>\`;
    } else {
      const maxOL = 40;
      const maxOC = 4000;
      const oLines = out.split('\\n');
      let oShown = oLines.slice(0, maxOL).join('\\n');
      if (oShown.length > maxOC) oShown = oShown.slice(0, maxOC) + '…';
      else if (oLines.length > maxOL) oShown += '\\n…';
      const oTrunc = oLines.length > maxOL || out.length > maxOC;
      bodyHtml += \`<div class="mimo-io-line mimo-io-line--out"><span class="mimo-io-k">\${outLab}</span><pre class="mimo-io-v mimo-io-v--out\${
        oTrunc ? ' is-clamped' : ''
      }" data-full="\${escHtml(out)}" data-shown="\${escHtml(oShown)}">\${escHtml(oShown)}</pre></div>\`;
    }
  }`;

if (c.includes(old)) {
  c = c.replace(old, neu);
  console.log('out clamp ok');
} else if (c.includes(old.replace(/\n/g, '\r\n'))) {
  c = c.replace(old.replace(/\n/g, '\r\n'), neu.replace(/\n/g, '\r\n'));
  console.log('out clamp ok crlf');
} else {
  console.log('out clamp miss');
  const i = c.indexOf('const outLab = isDiff');
  console.log(JSON.stringify(c.slice(i, i + 350)));
  process.exit(1);
}

// Expand handler: also clamped out
const oldH = `  det.querySelectorAll('pre.mimo-io-v--cmd.is-clamped').forEach((pre) => {`;
const neuH = `  det.querySelectorAll('pre.mimo-io-v--cmd.is-clamped, pre.mimo-io-v--out.is-clamped').forEach((pre) => {`;
if (c.includes(oldH)) {
  c = c.replace(oldH, neuH);
  console.log('handler ok');
} else if (c.includes(oldH.replace(/\n/g, '\r\n'))) {
  c = c.replace(oldH.replace(/\n/g, '\r\n'), neuH.replace(/\n/g, '\r\n'));
  console.log('handler ok crlf');
} else console.log('handler miss');

fs.writeFileSync(p, c);
console.log('done');

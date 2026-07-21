// smoke: parseInOut + looksLikeDiff (mirror main.js)
function parseInOutBody(bodyText) {
  const src = String(bodyText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  let inn = '', out = '';
  if (/^IN:\s*/i.test(src) || /^OUT:\s*/i.test(src)) {
    const outLine = src.match(/(?:^|\n)OUT:\s*\n?/i);
    if (outLine && typeof outLine.index === 'number') {
      const splitAt = outLine.index + (src[outLine.index] === '\n' ? 1 : 0);
      const before = src.slice(0, splitAt).replace(/^IN:\s*\n?/i, '').trim();
      const after = src.slice(splitAt).replace(/^OUT:\s*\n?/i, '').trim();
      if (/^OUT:/i.test(src)) { inn = ''; out = src.replace(/^OUT:\s*\n?/i, '').trim(); }
      else { inn = before; out = after; }
    } else if (/^IN:/i.test(src)) inn = src.replace(/^IN:\s*\n?/i, '').trim();
    return { inn, out };
  }
  return { inn: '', out: src };
}
function looksLikeDiffText(t) {
  t = String(t || '').replace(/\r\n/g, '\n');
  return /^(diff |Index: |@@ |\+|-|---|\+\+\+)/m.test(t) || /```diff/.test(t);
}
const cases = [
  ['IN:\n/path\r\nOUT:\n--- a/x\n+++ b/x\n-old\n+new', true, true],
  ['IN:\n/path\nOUT:\nIndex: f\n@@ -1 +1 @@\n-a\n+b', true, true],
  ['OUT:\nhello', false, true],
  ['plain', false, false],
];
let fail = 0;
for (const [body, wantDiff, wantOut] of cases) {
  const { inn, out } = parseInOutBody(body);
  const d = looksLikeDiffText(out);
  if (wantOut && !out) { console.log('FAIL empty out', body.slice(0,40)); fail++; }
  if (wantDiff !== d) { console.log('FAIL looksDiff', wantDiff, d, out.slice(0,40)); fail++; }
  else console.log('OK parse', body.slice(0, 25).replace(/\n/g,'\\n'), 'diff='+d);
}
// fillDiffPre return contract
function fillDiffPre(pre, text) {
  if (!looksLikeDiffText(text)) { pre.textContent = text; return pre; }
  return { tag: 'split' };
}
const r = fillDiffPre({}, '--- a\n+++ b\n-x\n+y');
console.log(r.tag === 'split' ? 'OK fillDiff return' : 'FAIL fillDiff');
if (r.tag !== 'split') fail++;
console.log(fail ? 'SMOKE_FAIL' : 'SMOKE_PASS');
process.exit(fail ? 1 : 0);

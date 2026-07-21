import fs from 'fs';

const p = 'src/webview/app/main.ts';
let c = fs.readFileSync(p, 'utf8');

const old = `  } else if (opts.soft) {
    // soft resync after streamDone — keep viewport, no pin jump
    const delta = chat.scrollHeight - prevH;
    chat.scrollTop = Math.max(0, prevT + delta);
  } else if (opts.pinBottom !== false) {`;
const neu = `  } else if (opts.soft) {
    // soft resync after streamDone — keep viewport, no pin jump
    const delta = chat.scrollHeight - prevH;
    chat.scrollTop = Math.max(0, prevT + delta);
    if (typeof ensureJumpBottom === 'function') ensureJumpBottom();
  } else if (opts.pinBottom !== false) {`;

if (c.includes(old)) {
  c = c.replace(old, neu);
  console.log('ok');
} else if (c.includes(old.replace(/\n/g, '\r\n'))) {
  c = c.replace(old.replace(/\n/g, '\r\n'), neu.replace(/\n/g, '\r\n'));
  console.log('ok crlf');
} else if (c.includes('ensureJumpBottom()') && c.includes('opts.soft')) {
  // maybe already
  if (c.includes('if (typeof ensureJumpBottom')) console.log('already');
  else {
    // inject after soft scrollTop line
    const mark = 'chat.scrollTop = Math.max(0, prevT + delta);';
    const i = c.indexOf(mark);
    if (i < 0) {
      console.log('miss');
      process.exit(1);
    }
    // only first in soft block - find soft first
    const soft = c.indexOf('} else if (opts.soft)');
    const j = c.indexOf(mark, soft);
    c =
      c.slice(0, j + mark.length) +
      "\n    if (typeof ensureJumpBottom === 'function') ensureJumpBottom();" +
      c.slice(j + mark.length);
    console.log('injected loose');
  }
} else {
  console.log('miss');
  process.exit(1);
}
fs.writeFileSync(p, c);

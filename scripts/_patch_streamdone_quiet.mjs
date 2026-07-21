import fs from 'fs';

const p = 'src/webview/app/main.ts';
let c = fs.readFileSync(p, 'utf8');

const old = `      if (typeof showToast === 'function') {
        const n = document.querySelectorAll('.message .mimo-part').length;
        /* soft */ showToast(n ? ('turn done · ' + n + ' tools') : 'turn done', 1200);
      }`;
const neu = `      {
        const n = document.querySelectorAll('.message .mimo-part').length;
        // only toast when tools present (CLI denser, less noise)
        if (n > 0) showToast('turn done · ' + n + ' tools', 1100);
        else if (statusLabel && !statusLabel.dataset.server) {
          statusLabel.textContent = 'done';
        }
      }`;
if (c.includes(old)) {
  c = c.replace(old, neu);
  console.log('ok');
} else if (c.includes(old.replace(/\n/g, '\r\n'))) {
  c = c.replace(old.replace(/\n/g, '\r\n'), neu.replace(/\n/g, '\r\n'));
  console.log('ok crlf');
} else {
  console.log('miss');
  process.exit(1);
}
fs.writeFileSync(p, c);

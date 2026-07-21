import fs from 'fs';

const p = 'src/webview/app/main.ts';
let c = fs.readFileSync(p, 'utf8');

const old = `    case 'error':
      setBusy(false);
      if (statusLabel) {
        statusLabel.textContent = String(message.error || 'error').slice(0, 40);
        statusLabel.classList.add('is-flash');
        setTimeout(() => statusLabel?.classList.remove('is-flash'), 900);
      }
      break;`;

const neu = `    case 'error':
      setBusy(false);
      {
        const err = String(message.error || 'error');
        showToast(err.slice(0, 80), 2200);
        if (statusLabel) {
          statusLabel.textContent = err.slice(0, 40);
          statusLabel.classList.add('is-flash', 'is-error');
          setTimeout(() => {
            statusLabel?.classList.remove('is-flash', 'is-error');
          }, 900);
        }
      }
      break;`;

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

import fs from 'fs';

const p = 'src/webview/app/main.ts';
let c = fs.readFileSync(p, 'utf8');

// Fix broken indentation/braces in serverStatus handler
const bad = `        if (!busy) {
          statusLabel.textContent = t || 'v2';
          statusLabel.classList.toggle('is-reconnect', st === 'reconnecting');
        if (st === 'reconnecting') statusLabel.classList.add('is-flash');
          else statusLabel.classList.remove('is-flash');
        }
      }
      break;`;
const good = `        if (!busy) {
          statusLabel.textContent = t || 'v2';
          statusLabel.classList.toggle('is-reconnect', st === 'reconnecting');
          if (st === 'reconnecting') statusLabel.classList.add('is-flash');
          else statusLabel.classList.remove('is-flash');
        }
      }
      break;`;
if (c.includes(bad)) {
  c = c.replace(bad, good);
  console.log('fixed lf');
} else if (c.includes(bad.replace(/\n/g, '\r\n'))) {
  c = c.replace(bad.replace(/\n/g, '\r\n'), good.replace(/\n/g, '\r\n'));
  console.log('fixed crlf');
} else {
  console.log('pattern miss - check manually');
}

// denser usage: keep package version when showing usage
const u =
  "if (t) {\n          statusLabel.dataset.server = t;\n          statusLabel.textContent = t;\n        }";
const u2 =
  "if (t) {\n          statusLabel.dataset.server = t;\n          statusLabel.textContent = t;\n          showToast(t, 1600);\n        }";
if (c.includes(u) && !c.includes("showToast(t, 1600)")) {
  c = c.replace(u, u2);
  console.log('usage toast');
} else if (c.includes(u.replace(/\n/g, '\r\n')) && !c.includes('showToast(t, 1600)')) {
  c = c.replace(u.replace(/\n/g, '\r\n'), u2.replace(/\n/g, '\r\n'));
  console.log('usage toast crlf');
}

fs.writeFileSync(p, c);
console.log('done');

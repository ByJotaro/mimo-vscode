import fs from 'fs';

const p = 'src/webview/app/main.ts';
let c = fs.readFileSync(p, 'utf8');
if (c.includes("showToast(anyClosed ? 'details open'")) {
  console.log('already');
  process.exit(0);
}
const n =
  "if (statusLabel) statusLabel.textContent = anyClosed ? 'details open' : 'details closed';\n    return true;";
const n2 = n.replace(/\n/g, '\r\n');
const inject =
  "const msg = anyClosed ? 'details open' : 'details closed';\n    showToast(msg);\n    if (statusLabel) statusLabel.textContent = msg;\n    return true;";
if (c.includes(n)) {
  c = c.replace(n, inject);
} else if (c.includes(n2)) {
  c = c.replace(n2, inject.replace(/\n/g, '\r\n'));
} else {
  console.log('miss');
  process.exit(1);
}
fs.writeFileSync(p, c);
console.log('ok');

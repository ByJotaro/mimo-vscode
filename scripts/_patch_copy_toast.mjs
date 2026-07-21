import fs from 'fs';

const p = 'src/webview/app/main.ts';
let c = fs.readFileSync(p, 'utf8');
// First meta dblclick copy feedback
if (!c.includes("showToast('copied')")) {
  const n = "statusLabel.textContent = 'copied';";
  const first = c.indexOf(n);
  if (first < 0) {
    console.log('miss');
    process.exit(1);
  }
  // replace all status-only copied with toast+status
  c = c.split(n).join("showToast('copied');\n        " + n);
  // fix double if already partially done
  c = c.replace(/showToast\('copied'\);\s*showToast\('copied'\);/g, "showToast('copied');");
  fs.writeFileSync(p, c);
  console.log('ok');
} else {
  console.log('already');
}

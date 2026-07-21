import fs from 'fs';

const p = 'src/webview/app/main.ts';
let c = fs.readFileSync(p, 'utf8');
const old =
  "head.innerHTML = `<h3>SESSION HISTORY</h3><button type=\"button\" class=\"mimo-history-close\" id=\"hist-close\">Close</button>`;";
const neu =
  "head.innerHTML = `<span class=\"mimo-history-title\">SESSION HISTORY</span><span class=\"mimo-history-hint\">Esc</span><button type=\"button\" class=\"mimo-history-close\" id=\"hist-close\">Close</button>`;";
if (c.includes(old)) {
  c = c.replace(old, neu);
  console.log('ok');
} else if (c.includes('mimo-history-hint')) {
  console.log('already');
} else {
  console.log('miss');
  const i = c.indexOf('SESSION HISTORY');
  console.log(JSON.stringify(c.slice(i - 40, i + 120)));
  process.exit(1);
}
fs.writeFileSync(p, c);

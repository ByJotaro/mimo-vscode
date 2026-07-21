import fs from 'fs';

const p = 'src/webview/app/main.ts';
let c = fs.readFileSync(p, 'utf8');
if (c.includes('// focus after sessionData')) {
  console.log('already');
  process.exit(0);
}
const needle = 'loadMoreInFlight = false;';
// find first after sessionData case - search from case 'sessionData'
const start = c.indexOf("case 'sessionData'");
if (start < 0) {
  console.log('sessionData miss');
  process.exit(1);
}
const i = c.indexOf(needle, start);
if (i < 0) {
  console.log('loadMoreInFlight miss');
  process.exit(1);
}
const inject =
  needle +
  "\n      // focus after sessionData\n      setTimeout(() => promptEl?.focus(), 50);";
c = c.slice(0, i) + inject + c.slice(i + needle.length);
fs.writeFileSync(p, c);
console.log('ok');

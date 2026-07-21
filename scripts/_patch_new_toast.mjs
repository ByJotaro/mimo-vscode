import fs from 'fs';

const p = 'src/host/SidebarProvider.ts';
let c = fs.readFileSync(p, 'utf8');
if (c.includes("toast', text: 'New session'")) {
  console.log('already');
  process.exit(0);
}
const needle = 'this.log.appendLine(`[NEW_SESSION] ${s.id}`);';
const i = c.indexOf(needle);
if (i < 0) {
  console.log('miss');
  process.exit(1);
}
const inject =
  "this.post({ type: 'toast', text: 'New session' });\n      " + needle;
c = c.slice(0, i) + inject + c.slice(i);
fs.writeFileSync(p, c);
console.log('ok');

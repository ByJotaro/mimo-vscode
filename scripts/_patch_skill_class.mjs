import fs from 'fs';

const p = 'src/webview/app/main.ts';
let c = fs.readFileSync(p, 'utf8');
if (c.includes('mimo-part--skill')) {
  console.log('already');
  process.exit(0);
}
const n1 =
  "const isReadTool = /^(read|grep|glob|search|webfetch|websearch|codesearch)$/i.test(titleRaw);";
if (!c.includes(n1)) {
  console.log('n1 miss');
  process.exit(1);
}
c = c.replace(
  n1,
  n1 +
    "\n  const isSkillTool = /^(skill|workflow|actor|task|memory|history)$/i.test(titleRaw);"
);
const n2 = `        : isReadTool
          ? ' mimo-part--read'
          : '');`;
const n2b = n2.replace(/\n/g, '\r\n');
const r2 = `        : isReadTool
          ? ' mimo-part--read'
          : isSkillTool
            ? ' mimo-part--skill'
            : '');`;
if (c.includes(n2)) c = c.replace(n2, r2);
else if (c.includes(n2b)) c = c.replace(n2b, r2.replace(/\n/g, '\r\n'));
else {
  console.log('n2 miss');
  process.exit(1);
}
fs.writeFileSync(p, c);
console.log('ok');

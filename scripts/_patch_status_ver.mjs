import fs from 'fs';

const p = 'src/extension/activate.ts';
let c = fs.readFileSync(p, 'utf8');
if (c.includes('verShort')) {
  console.log('exists');
  process.exit(0);
}
const old = "status.text = '$(chip) MiMo';";
if (!c.includes(old)) {
  console.log('miss', JSON.stringify(c.match(/status\.text = .*/)?.[0]));
  process.exit(1);
}
const neu = `const verShort = String(context.extension.packageJSON?.version || '').replace(/^1\\.0\\.0-/, '');
  status.text = verShort ? \`\$(chip) MiMo \${verShort}\` : '\$(chip) MiMo';`;
c = c.replace(old, neu);
fs.writeFileSync(p, c);
console.log('ok');

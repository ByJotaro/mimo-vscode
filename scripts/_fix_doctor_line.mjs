import fs from 'fs';

let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
// Fix broken line 230 - unterminated string (missing closing quote before comma)
const bad = h.match(/'- extension:.*\n/);
console.log('bad line:', JSON.stringify(bad?.[0]));

// Replace any broken extension line with a correct one
h = h.replace(
  /[^\n]*'- extension:[^\n]*/,
  "            '- extension: `' + String(this.context.extension.packageJSON?.version || '-') + '`',"
);

fs.writeFileSync('src/host/SidebarProvider.ts', h);
const m = h.match(/[^\n]*'- extension:[^\n]*/);
console.log('fixed:', JSON.stringify(m?.[0]));

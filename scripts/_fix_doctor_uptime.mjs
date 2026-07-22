import fs from 'fs';

let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
// Fix broken doctor uptime line (unterminated string)
h = h.replace(
  /[^\n]*host uptime[^\n]*/,
  "            '- host uptime: `' + Math.floor(process.uptime()) + 's`', // DOCTOR_UPTIME"
);
fs.writeFileSync('src/host/SidebarProvider.ts', h);
const m = h.match(/[^\n]*host uptime[^\n]*/);
console.log('fixed', JSON.stringify(m?.[0]));

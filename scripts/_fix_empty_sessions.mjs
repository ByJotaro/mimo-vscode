import fs from 'fs';

let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
const good =
  "if (!sessions.length) this.post({ type: 'toast', text: 'no sessions' }); // EMPTY_SESSIONS_TOAST";
h = h.replace(
  /if \(!\(\[\] \|\| \[\]\)\.length\) this\.post\(\{ type: 'toast', text: 'no sessions' \}\); \/\/ EMPTY_SESSIONS_TOAST/,
  good
);
// also any variant with always-truthy empty array
h = h.replace(
  /if \(!\(\[\][^\)]*\)\.length\) this\.post\(\{ type: 'toast', text: 'no sessions' \}\); \/\/ EMPTY_SESSIONS_TOAST/,
  good
);
fs.writeFileSync('src/host/SidebarProvider.ts', h);
console.log('ok', h.includes('!sessions.length') && h.includes('EMPTY_SESSIONS_TOAST'));
const i = h.indexOf('EMPTY_SESSIONS_TOAST');
console.log(JSON.stringify(h.slice(i - 70, i + 30)));

import fs from 'fs';

let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
if (h.includes("'- extension: `'")) {
  console.log('already');
  process.exit(0);
}

const old =
  "            '- workspace: `' + root + '`,\n            '- mimo bin: `' + bin + '`,";
const neu =
  "            '- extension: `' + String(this.context.extension.packageJSON?.version || '—') + '`,\n" +
  "            '- workspace: `' + root + '`,\n" +
  "            '- mimo bin: `' + bin + '`,";

if (!h.includes(old)) {
  // try with \r\n
  const old2 = old.replace(/\n/g, '\r\n');
  if (h.includes(old2)) {
    h = h.replace(old2, neu.replace(/\n/g, '\r\n'));
    console.log('crlf ok');
  } else {
    // index-based insert after **Doctor** line
    const marker = "'**Doctor**',\n";
    const idx = h.indexOf(marker);
    if (idx < 0) {
      console.error('marker miss');
      process.exit(1);
    }
    const at = idx + marker.length;
    const ext =
      "            '- extension: `' + String(this.context.extension.packageJSON?.version || '—') + '`,\n";
    h = h.slice(0, at) + ext + h.slice(at);
    console.log('insert after Doctor');
  }
} else {
  h = h.replace(old, neu);
  console.log('replace ok');
}

h = h.replace(/[ \t]+case 'doctor': \{/, "        case 'doctor': {");
fs.writeFileSync('src/host/SidebarProvider.ts', h);
console.log('has', h.includes("'- extension: `'"));

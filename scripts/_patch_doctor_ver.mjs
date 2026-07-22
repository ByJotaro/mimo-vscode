import fs from 'fs';

let h = fs.readFileSync('src/host/SidebarProvider.ts', 'utf8');
if (h.includes("- extension: `")) {
  console.log('already has extension line');
  process.exit(0);
}

const needle = "            '- workspace: `' + root + '`,";
const insert =
  "            '- extension: `' + String(this.context.extension.packageJSON?.version || '—') + '`,\n" +
  needle;

// doctor block only — first occurrence after **Doctor**
const doc = h.indexOf("'**Doctor**'");
if (doc < 0) {
  console.error('no doctor');
  process.exit(1);
}
const sub = h.slice(doc, doc + 800);
const rel = sub.indexOf(needle);
if (rel < 0) {
  // try without trailing comma variance
  console.log(JSON.stringify(sub.slice(0, 300)));
  process.exit(1);
}
const abs = doc + rel;
h = h.slice(0, abs) + insert + h.slice(abs + needle.length);
// fix double workspace if insert included needle and we also left original — insert replaces by prepending before needle so original needle stays once after extension. Wait: insert = extension + needle, we replace needle with insert so one workspace remains. Good.

// also fix weird indentation on case 'doctor'
h = h.replace(/[ \t]+case 'doctor': \{/, "        case 'doctor': {");

fs.writeFileSync('src/host/SidebarProvider.ts', h);
console.log('doctor extension line patched');

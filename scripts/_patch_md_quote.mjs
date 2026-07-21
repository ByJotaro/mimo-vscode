import fs from 'fs';

const p = 'src/webview/app/main.ts';
let c = fs.readFileSync(p, 'utf8');
if (c.includes('blockquote') || c.includes("blocks.push(`<hr")) {
  console.log('maybe already');
}

const needle = `    if (/^[-*]\\s+/.test(line)) {
      flush();
      blocks.push(\`<li data-list="ul">\${inlineMd(line.replace(/^[-*]\\s+/, ''))}</li>\`);
      continue;
    }`;

const inject = `    if (/^>\\s?/.test(line)) {
      flush();
      blocks.push(\`<blockquote>\${inlineMd(line.replace(/^>\\s?/, ''))}</blockquote>\`);
      continue;
    }
    if (/^(-{3,}|\\*{3,}|_{3,})$/.test(line.trim())) {
      flush();
      blocks.push('<hr/>');
      continue;
    }
    if (/^[-*]\\s+/.test(line)) {
      flush();
      blocks.push(\`<li data-list="ul">\${inlineMd(line.replace(/^[-*]\\s+/, ''))}</li>\`);
      continue;
    }`;

if (c.includes(needle)) {
  c = c.replace(needle, inject);
  console.log('ok');
} else if (c.includes(needle.replace(/\n/g, '\r\n'))) {
  c = c.replace(needle.replace(/\n/g, '\r\n'), inject.replace(/\n/g, '\r\n'));
  console.log('ok crlf');
} else {
  // looser insert before ul bullet
  const mark = "if (/^[-*]\\s+/.test(line))";
  const i = c.indexOf(mark);
  if (i < 0) {
    console.log('miss', mark);
    process.exit(1);
  }
  const pre = `    if (/^>\\s?/.test(line)) {
      flush();
      blocks.push(\`<blockquote>\${inlineMd(line.replace(/^>\\s?/, ''))}</blockquote>\`);
      continue;
    }
    if (/^(-{3,}|\\*{3,}|_{3,})$/.test(line.trim())) {
      flush();
      blocks.push('<hr/>');
      continue;
    }
    `;
  c = c.slice(0, i) + pre + c.slice(i);
  console.log('loose ok');
}
fs.writeFileSync(p, c);

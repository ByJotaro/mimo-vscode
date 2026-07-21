import fs from 'fs';

const p = 'src/webview/app/main.ts';
let c = fs.readFileSync(p, 'utf8');

// Better version line + toast summary
const old = `    const lines = [
      \`**Status**\`,
      \`- session: \\\`\${activeSessionId || '(home)'}\\\`\`,
      \`- mode: \\\`\${selectedMode || '—'}\\\` · model: \\\`\${selectedModel || '—'}\\\`\`,
      \`- messages: \${msgs} · tools: \${tools} · busy: \${busy ? 'yes' : 'no'}\`,
      \`- version: \\\`\${statusLabel?.dataset.server || 'v2'}\\\`\`,
    ];
    appendOrUpdateMessage({
      id: 'sys_status_' + Date.now(),
      role: 'assistant',
      text: lines.join('\\n'),
    });
    if (statusLabel) statusLabel.textContent = 'usage…';
    return true;`;

// Use simpler string match without over-escaping
const mark = "const tools = document.querySelectorAll('.mimo-part').length;";
if (!c.includes(mark)) {
  console.log('mark miss');
  process.exit(1);
}

if (!c.includes("showToast(tools + ' tools'")) {
  const blockStart = c.indexOf("if (cmd === 'cost' || cmd === 'status' || cmd === 'usage')");
  if (blockStart < 0) {
    console.log('status block miss');
    process.exit(1);
  }
  // replace version line
  c = c.replace(
    "`- version: \\`${statusLabel?.dataset.server || 'v2'}\\``,",
    "`- version: \\`${statusLabel?.dataset.version || statusLabel?.dataset.server || 'v2'}\\`,"
  );
  // fix if broken - try without double escape issues - read file for exact
  console.log('attempt version replace');
}

// Insert toast before return true in status block
const ret = `    if (statusLabel) statusLabel.textContent = 'usage…';
    return true;
  }
  if (cmd === 'details') {`;
const retn = `    if (statusLabel) statusLabel.textContent = 'usage…';
    showToast(msgs + ' msgs · ' + tools + ' tools', 1400);
    return true;
  }
  if (cmd === 'details') {`;
if (c.includes(ret)) {
  c = c.replace(ret, retn);
  console.log('toast ok');
} else if (c.includes(ret.replace(/\n/g, '\r\n'))) {
  c = c.replace(ret.replace(/\n/g, '\r\n'), retn.replace(/\n/g, '\r\n'));
  console.log('toast ok crlf');
} else {
  console.log('toast miss');
  const i = c.indexOf("statusLabel.textContent = 'usage…'");
  console.log(JSON.stringify(c.slice(i - 20, i + 120)));
}

// Fix version line more carefully
const verLine = "- version: `${statusLabel?.dataset.server || 'v2'}`";
// in source it's with backticks inside template
const idx = c.indexOf('version:');
if (idx > 0) {
  const slice = c.slice(idx, idx + 80);
  console.log('ver slice', JSON.stringify(slice));
  if (c.includes("statusLabel?.dataset.server || 'v2'") && !c.includes('dataset.version || statusLabel')) {
    c = c.replace(
      "statusLabel?.dataset.server || 'v2'",
      "statusLabel?.dataset.version || statusLabel?.dataset.server || 'v2'"
    );
    console.log('version line ok');
  }
}

fs.writeFileSync(p, c);
console.log('done');

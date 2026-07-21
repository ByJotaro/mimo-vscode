import fs from 'fs';

const p = 'src/webview/app/main.ts';
let c = fs.readFileSync(p, 'utf8');

const old = `    } else if (statusLabel.dataset.server) {
      statusLabel.textContent = statusLabel.dataset.server;
    } else {
      statusLabel.textContent = 'v2';
    }`;
const neu = `    } else if (statusLabel.dataset.server) {
      statusLabel.textContent = statusLabel.dataset.server;
    } else {
      statusLabel.textContent =
        statusLabel.dataset.version
          ? 'mimo · ' + statusLabel.dataset.version
          : 'mimo';
    }`;

if (c.includes(old)) {
  c = c.replace(old, neu);
  console.log('idle ok');
} else if (c.includes(old.replace(/\n/g, '\r\n'))) {
  c = c.replace(old.replace(/\n/g, '\r\n'), neu.replace(/\n/g, '\r\n'));
  console.log('idle ok crlf');
} else console.log('idle skip');

// store version on init
if (!c.includes('dataset.version')) {
  const v = `statusLabel.dataset.server = String(message.version);
        if (!statusLabel.textContent || statusLabel.textContent === 'v2') {
          statusLabel.textContent = 'mimo · ' + String(message.version);
        }`;
  // find version set
  const mark = "statusLabel.dataset.server = String(message.version);";
  if (c.includes(mark) && !c.includes('dataset.version')) {
    c = c.replace(
      mark,
      "statusLabel.dataset.version = String(message.version);\n        " + mark
    );
    console.log('version dataset ok');
  }
}

fs.writeFileSync(p, c);
console.log('done');

import fs from 'fs';

const p = 'src/webview/app/main.ts';
let c = fs.readFileSync(p, 'utf8');

const bad = `      document
        .querySelector(\`.message[data-id="\${CSS.escape(String(message.messageId || 'live'))}"]\`)
        ?.classList.add('is-streaming');
        // last-open-tool-scroll
        const lastOpen = document.querySelector(
          '.message.is-streaming .mimo-part[open]:last-of-type'
        ) as HTMLElement | null;
        lastOpen?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      if (busy && statusLabel) {
        const n = document.querySelectorAll('.message.is-streaming .mimo-part').length;
        statusLabel.textContent = n > 0 ? 'running · ' + n + ' tools' : 'running…';
      }
      break;`;

const good = `      document
        .querySelector(\`.message[data-id="\${CSS.escape(String(message.messageId || 'live'))}"]\`)
        ?.classList.add('is-streaming');
      // last-open-tool-scroll
      {
        const lastOpen = document.querySelector(
          '.message.is-streaming .mimo-part[open]:last-of-type'
        ) as HTMLElement | null;
        lastOpen?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
      if (busy && statusLabel) {
        const n = document.querySelectorAll('.message.is-streaming .mimo-part').length;
        statusLabel.textContent = n > 0 ? 'running · ' + n + ' tools' : 'running…';
      }
      break;`;

if (c.includes(bad)) {
  c = c.replace(bad, good);
  console.log('streamUpdate indent ok');
} else if (c.includes(bad.replace(/\n/g, '\r\n'))) {
  c = c.replace(bad.replace(/\n/g, '\r\n'), good.replace(/\n/g, '\r\n'));
  console.log('streamUpdate indent ok crlf');
} else {
  console.log('streamUpdate pattern miss (may already fixed)');
}

// On streamDone, clear running tool class before soft resync
if (!c.includes('mimo-part--running')) {
  console.log('no running class in webview?');
} else if (!c.includes('// clear running tool chrome')) {
  const needle = `      document.querySelectorAll('.message.is-streaming').forEach((el) => {
        el.classList.remove('is-streaming');
        // Collapse thoughts after turn ends (CLI collapses finished thought)
        el.querySelectorAll('details.mimo-thinking[open]').forEach((d) => {
          (d as HTMLDetailsElement).open = false;
        });
      });`;
  const inject = `      document.querySelectorAll('.message.is-streaming').forEach((el) => {
        el.classList.remove('is-streaming');
        // clear running tool chrome
        el.querySelectorAll('.mimo-part--running').forEach((p) => {
          p.classList.remove('mimo-part--running');
        });
        // Collapse thoughts after turn ends (CLI collapses finished thought)
        el.querySelectorAll('details.mimo-thinking[open]').forEach((d) => {
          (d as HTMLDetailsElement).open = false;
        });
      });`;
  if (c.includes(needle)) {
    c = c.replace(needle, inject);
    console.log('clear running ok');
  } else if (c.includes(needle.replace(/\n/g, '\r\n'))) {
    c = c.replace(needle.replace(/\n/g, '\r\n'), inject.replace(/\n/g, '\r\n'));
    console.log('clear running ok crlf');
  } else console.log('clear running miss');
}

fs.writeFileSync(p, c);
console.log('done');

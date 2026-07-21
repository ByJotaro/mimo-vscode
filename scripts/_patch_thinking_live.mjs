import fs from 'fs';

const p = 'src/webview/app/main.ts';
let c = fs.readFileSync(p, 'utf8');

const old = `      document
        .querySelector(\`.message[data-id="\${CSS.escape(String(message.messageId || 'live'))}"]\`)
        ?.classList.add('is-streaming');
      // last-open-tool-scroll
      {
        const lastOpen = document.querySelector(
          '.message.is-streaming .mimo-part[open]:last-of-type'
        ) as HTMLElement | null;
        lastOpen?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }`;

const neu = `      {
        const live = document.querySelector(
          \`.message[data-id="\${CSS.escape(String(message.messageId || 'live'))}"]\`
        ) as HTMLElement | null;
        live?.classList.add('is-streaming');
        // open thoughts live while streaming (CLI)
        live?.querySelectorAll('details.mimo-thinking:not([open])').forEach((d) => {
          (d as HTMLDetailsElement).open = true;
        });
      }
      // last-open-tool-scroll
      {
        const lastOpen = document.querySelector(
          '.message.is-streaming .mimo-part[open]:last-of-type'
        ) as HTMLElement | null;
        lastOpen?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }`;

if (c.includes(old)) {
  c = c.replace(old, neu);
  console.log('ok');
} else if (c.includes(old.replace(/\n/g, '\r\n'))) {
  c = c.replace(old.replace(/\n/g, '\r\n'), neu.replace(/\n/g, '\r\n'));
  console.log('ok crlf');
} else if (c.includes('open thoughts live while streaming')) {
  console.log('already');
} else {
  console.log('miss');
  const i = c.indexOf("case 'streamUpdate'");
  console.log(JSON.stringify(c.slice(i, i + 500)));
  process.exit(1);
}
fs.writeFileSync(p, c);

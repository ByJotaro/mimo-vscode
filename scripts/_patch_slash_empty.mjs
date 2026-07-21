import fs from 'fs';

const p = 'src/webview/app/main.ts';
let c = fs.readFileSync(p, 'utf8');

const old = `  if (!ranked.length) {
    el.hidden = true;
    return;
  }
  if (slashIndex >= ranked.length) slashIndex = 0;
  el.innerHTML = ranked
    .map(
      (c, i) =>
        \`<div class="slash-item\${i === slashIndex ? ' active' : ''}" data-name="\${escHtml(c.name)}"><span class="slash-name">/\${escHtml(c.name)}</span><span class="slash-desc">\${escHtml(c.description || '')}</span></div>\`
    )
    .join('');
  el.hidden = false;`;

const neu = `  if (!ranked.length) {
    el.innerHTML =
      '<div class="slash-empty">No matches for <span class="slash-empty-q">/' +
      escHtml(filter || '') +
      '</span></div>';
    el.hidden = false;
    return;
  }
  if (slashIndex >= ranked.length) slashIndex = 0;
  el.innerHTML = ranked
    .map((c, i) => {
      const isSkill = /^(Skill:|skill:)/i.test(c.description || '') || false;
      const desc = escHtml(c.description || '');
      return (
        \`<div class="slash-item\${i === slashIndex ? ' active' : ''}\${isSkill ? ' slash-item--skill' : ''}" data-name="\${escHtml(c.name)}">\` +
        \`<span class="slash-name">/\${escHtml(c.name)}</span>\` +
        \`<span class="slash-desc">\${desc}</span></div>\`
      );
    })
    .join('');
  el.hidden = false;`;

if (c.includes(old)) {
  c = c.replace(old, neu);
  console.log('ok lf');
} else if (c.includes(old.replace(/\n/g, '\r\n'))) {
  c = c.replace(old.replace(/\n/g, '\r\n'), neu.replace(/\n/g, '\r\n'));
  console.log('ok crlf');
} else {
  // looser: just empty block
  const empty = `  if (!ranked.length) {
    el.hidden = true;
    return;
  }`;
  const emptyNew = `  if (!ranked.length) {
    el.innerHTML =
      '<div class="slash-empty">No matches for <span class="slash-empty-q">/' +
      escHtml(filter || '') +
      '</span></div>';
    el.hidden = false;
    return;
  }`;
  if (c.includes(empty)) {
    c = c.replace(empty, emptyNew);
    console.log('empty only ok');
  } else if (c.includes(empty.replace(/\n/g, '\r\n'))) {
    c = c.replace(empty.replace(/\n/g, '\r\n'), emptyNew.replace(/\n/g, '\r\n'));
    console.log('empty only ok crlf');
  } else {
    console.log('miss');
    process.exit(1);
  }
}

fs.writeFileSync(p, c);
console.log('done');

import fs from 'fs';

const p = 'src/webview/app/main.ts';
let c = fs.readFileSync(p, 'utf8');

// Permission reply toast
if (!c.includes("showToast(r === 'reject'")) {
  const old = `    if (statusLabel) {
      statusLabel.textContent =
        r === 'reject' ? 'rejected' : r === 'always' ? 'allowed always' : 'allowed once';
      statusLabel.classList.add('is-flash');
      setTimeout(() => statusLabel?.classList.remove('is-flash'), 800);
    }
  };
  ov.querySelectorAll('button[data-r]').forEach((b) => {`;
  const neu = `    const msg =
      r === 'reject' ? 'rejected' : r === 'always' ? 'allowed always' : 'allowed once';
    showToast(msg);
    if (statusLabel) {
      statusLabel.textContent = msg;
      statusLabel.classList.add('is-flash');
      setTimeout(() => statusLabel?.classList.remove('is-flash'), 800);
    }
  };
  ov.querySelectorAll('button[data-r]').forEach((b) => {`;
  if (c.includes(old)) {
    c = c.replace(old, neu);
    console.log('perm toast ok');
  } else if (c.includes(old.replace(/\n/g, '\r\n'))) {
    c = c.replace(old.replace(/\n/g, '\r\n'), neu.replace(/\n/g, '\r\n'));
    console.log('perm toast ok crlf');
  } else console.log('perm toast miss');
} else console.log('perm toast already');

// Question submit toast — find questionReply post
if (!c.includes("showToast('answered')")) {
  // look for post questionReply
  const re = /post\(\{\s*type:\s*'questionReply'[\s\S]*?\}\);/;
  const m = c.match(re);
  if (m) {
    const inject = m[0] + "\n    showToast('answered');";
    c = c.replace(m[0], inject);
    console.log('question toast ok');
  } else {
    // try find remove after question reply
    const i = c.indexOf("type: 'questionReply'");
    console.log('questionReply at', i, i >= 0 ? JSON.stringify(c.slice(i, i + 280)) : '');
  }
}

fs.writeFileSync(p, c);
console.log('done');

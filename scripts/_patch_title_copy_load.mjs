import fs from 'fs';

const p = 'src/webview/app/main.ts';
let c = fs.readFileSync(p, 'utf8');

// Title dblclick copy (same as meta)
if (!c.includes('mimo-part-title') || !c.includes("querySelector('.mimo-part-title')")) {
  const anchor = `  const metaEl = det.querySelector('.mimo-part-meta');
  metaEl?.addEventListener('dblclick', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const t = inn || metaText || '';
    if (t && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(t);
      if (statusLabel) {
        showToast('copied');
        statusLabel.textContent = 'copied';
        statusLabel.classList.add('is-flash');
        setTimeout(() => statusLabel?.classList.remove('is-flash'), 500);
      }
    }
  });
  return det;`;
  const inject = `  const copyTool = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    const t = inn || metaText || titleRaw || '';
    if (t && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(t);
      showToast('copied');
      if (statusLabel) {
        statusLabel.textContent = 'copied';
        statusLabel.classList.add('is-flash');
        setTimeout(() => statusLabel?.classList.remove('is-flash'), 500);
      }
    }
  };
  det.querySelector('.mimo-part-title')?.addEventListener('dblclick', copyTool);
  det.querySelector('.mimo-part-meta')?.addEventListener('dblclick', copyTool);
  return det;`;
  if (c.includes(anchor)) {
    c = c.replace(anchor, inject);
    console.log('title copy ok');
  } else if (c.includes(anchor.replace(/\n/g, '\r\n'))) {
    c = c.replace(anchor.replace(/\n/g, '\r\n'), inject.replace(/\n/g, '\r\n'));
    console.log('title copy ok crlf');
  } else {
    console.log('title copy miss');
  }
} else {
  console.log('title copy maybe already');
}

// Load older button text denser + toast on click
const loadBtn = `    btn.addEventListener('click', () => requestLoadMore(true));
    bar.appendChild(btn);
    chat.insertBefore(bar, chat.firstChild);
  }
  const btn = document.getElementById('mimo-load-older-btn');
  if (btn) btn.textContent = \`↑ Load older (\${olderCount})\`;
}`;
const loadBtnNew = `    btn.addEventListener('click', () => {
      showToast('loading older…');
      requestLoadMore(true);
    });
    bar.appendChild(btn);
    chat.insertBefore(bar, chat.firstChild);
  }
  const btn = document.getElementById('mimo-load-older-btn');
  if (btn) btn.textContent = \`↑ Load older · \${olderCount}\`;
}`;
if (c.includes(loadBtn)) {
  c = c.replace(loadBtn, loadBtnNew);
  console.log('load older ok');
} else if (c.includes(loadBtn.replace(/\n/g, '\r\n'))) {
  c = c.replace(loadBtn.replace(/\n/g, '\r\n'), loadBtnNew.replace(/\n/g, '\r\n'));
  console.log('load older ok crlf');
} else {
  console.log('load older miss');
}

fs.writeFileSync(p, c);
console.log('done');

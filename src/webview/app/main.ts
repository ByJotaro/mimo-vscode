/**
 * Webview entry (bundled to media/app.js).
 */
import { splitMimoParts } from '../../host/format/mimoPart';
import { collapseMessagesForDisplay } from '../../host/session/merge';
import { paintLogo } from '../logo/logoEngine';
import { startStarfield } from '../logo/starfield';

let logoHandle: { destroy: () => void } | null = null;
let starfieldHandle: { destroy: () => void } | null = null;
import {
  pinBottomUntilSettled,
  preserveScrollOnPrepend,
  updateHistoryTopSpacer,
  scrollToBottom,
  isNearBottom,
} from '../scroll/pin';

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): any;
  setState(s: any): void;
};

const vscode = acquireVsCodeApi();
(window as any).__mimoVscodeApi = vscode;

type DisplayMessage = {
  id: string;
  role: string;
  text: string;
  meta?: Record<string, unknown>;
};

const chat = document.getElementById('chat') as HTMLElement;
const titleEl = document.getElementById('session-title') as HTMLElement;
const btnHome = document.getElementById('btn-home') as HTMLButtonElement;
const btnHistoryTop = document.getElementById('btn-history-top') as HTMLButtonElement | null;
const btnUndo = document.getElementById('btn-undo') as HTMLButtonElement | null;
const btnSend = document.getElementById('btn-send') as HTMLButtonElement;
const btnAbort = document.getElementById('btn-abort') as HTMLButtonElement | null;
const btnFork = document.getElementById('btn-fork') as HTMLButtonElement | null;
const promptEl = document.getElementById('prompt') as HTMLTextAreaElement;
const modeSelect = document.getElementById('mode-select') as HTMLSelectElement | null;
const modelSelect = document.getElementById('model-select') as HTMLSelectElement | null;
const statusLabel = document.getElementById('status-label') as HTMLElement | null;

let activeSessionId = '';
let loadedCount = 0;
let loadMoreInFlight = false;
let loadMoreCooldown = 0;
let busy = false;
let lastUserPrompt = '';
let selectedMode = 'plan';
let selectedModel = '';
let autoScroll = true;

function post(msg: unknown): void {
  vscode.postMessage(msg);
}

function escHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderPartCard(seg: ReturnType<typeof splitMimoParts>[number]): HTMLElement {
  if (seg.kind === 'text') {
    const d = document.createElement('div');
    d.className = 'mimo-text-seg';
    d.innerHTML = formatMarkdownLite(seg.body);
    return d;
  }
  if (seg.kind === 'thinking') {
    const det = document.createElement('details');
    det.className = 'mimo-thinking';
    // Open while parent message is still streaming (CLI shows live thought)
    det.open = Boolean((seg as any).open) || Boolean(document.querySelector('.message.is-streaming'));
    const bodyText = String((seg as any).body || '').trim();
    const words = bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0;
    const dur =
      String((seg as any).duration || '').trim() ||
      (words ? `~${Math.max(1, Math.round(words / 40))}s` : '');
    const summary = document.createElement('summary');
    const chev = document.createElement('span');
    chev.className = 'mimo-chev';
    chev.setAttribute('aria-hidden', 'true');
    chev.textContent = '▸';
    summary.appendChild(chev);
    const title = document.createElement('span');
    title.className = 'mimo-thinking-title';
    // CLI-style label (matches “Thought” row in TUI)
    title.textContent = (seg as any).title === 'thinking' || !(seg as any).title
      ? 'Thought'
      : String((seg as any).title);
    summary.appendChild(title);
    if (dur) {
      const d = document.createElement('span');
      d.className = 'mimo-dur mimo-dur--circle';
      d.textContent = dur.replace(/^~/, '');
      d.title = words ? words + ' words' : 'thinking time';
      summary.appendChild(d);
    }
    if (words) {
      const w = document.createElement('span');
      w.className = 'mimo-thinking-hint';
      w.textContent = words + ' words';
      summary.appendChild(w);
    }
    det.addEventListener('toggle', () => {
      chev.textContent = det.open ? '▾' : '▸';
    });
    det.appendChild(summary);
    const body = document.createElement('div');
    body.className = 'mimo-thinking-body';
    body.textContent = bodyText;
    det.appendChild(body);
    return det;
  }
  // Flat CLI tool card (v1): left bar + title strip — no nested rounded windows
  const det = document.createElement('details');
  const titleRaw = String((seg as any).title || seg.kind);
  const kind = String(seg.kind || 'tool').toLowerCase();
  const isBashTool = /^(bash|shell|cmd|powershell|pwsh)$/i.test(titleRaw);
  const isEditTool =
    kind === 'patch' || /^(write|edit|multiedit|apply_patch|str_replace)$/i.test(titleRaw);
  det.className =
    'mimo-part mimo-part--flat' +
    (isBashTool ? ' mimo-part--bash' : isEditTool ? ' mimo-part--edit' : '');
  det.open = Boolean((seg as any).open);
  const title = escHtml(titleRaw);
  const body = String((seg as any).body || '');
  const { inn, out } = parseInOut(body);
  const isDiff =
    looksLikeDiff(out) ||
    seg.kind === 'patch' ||
    /^(write|edit)$/i.test(titleRaw);
  // Closed-row preview like CLI: bash · first line of command
  const previewSrc = (inn || out || (seg as any).meta || '').replace(/\s+/g, ' ').trim();
  const preview =
    previewSrc.length > 72 ? previewSrc.slice(0, 70) + '…' : previewSrc;
  const metaText = preview || String((seg as any).meta || '');
  const dur = String((seg as any).duration || '').trim();

  let bodyHtml = '';
  if (inn) {
    const inLab = isDiff || seg.kind === 'patch' ? 'file' : 'in';
    const isBash = /^(bash|shell|cmd|powershell|pwsh)$/i.test(titleRaw);
    const maxL = isBash ? 5 : 8;
    const maxC = isBash ? 600 : 1200;
    const lines = inn.split('\n');
    let shown = lines.slice(0, maxL).join('\n');
    if (shown.length > maxC) shown = shown.slice(0, maxC) + '…';
    else if (lines.length > maxL) shown += '\n…';
    const trunc = lines.length > maxL || inn.length > maxC;
    bodyHtml += `<div class="mimo-io-line mimo-io-line--in"><span class="mimo-io-k">${inLab}</span><pre class="mimo-io-v mimo-io-v--cmd${
      trunc ? ' is-clamped' : ''
    }" data-full="${escHtml(inn)}" data-shown="${escHtml(shown)}">${escHtml(shown)}</pre></div>`;
  }
  if (inn && out) bodyHtml += `<div class="mimo-io-hr" role="separator"></div>`;
  if (out) {
    const outLab = isDiff ? 'diff' : 'out';
    bodyHtml += `<div class="mimo-io-line mimo-io-line--out"><span class="mimo-io-k">${outLab}</span>${
      isDiff ? renderDiffOut(out) : `<pre class="mimo-io-v">${escHtml(out)}</pre>`
    }</div>`;
  }
  det.innerHTML = `<summary><span class="mimo-chev" aria-hidden="true">▸</span><span class="mimo-part-title">${title}</span>${
    metaText ? `<span class="mimo-part-meta">${escHtml(metaText)}</span>` : ''
  }${
    dur ? `<span class="mimo-dur">${escHtml(dur)}</span>` : ''
  }</summary><div class="mimo-part-body"><div class="mimo-io mimo-io--flat">${bodyHtml}</div></div>`;

  // Double-click IN path → ask host to open file
  det.querySelectorAll('.mimo-io-line--in .mimo-io-v').forEach((pre) => {
    pre.addEventListener('dblclick', () => {
      const t = ((pre as HTMLElement).dataset.full || pre.textContent || '').trim().split('\n')[0];
      if (t && (/[\\/]/.test(t) || /\.\w{1,8}$/.test(t))) {
        post({ type: 'openFilePath', path: t });
      }
    });
  });
  // Click clamped command to expand/collapse (v1)
  det.querySelectorAll('pre.mimo-io-v--cmd.is-clamped').forEach((pre) => {
    pre.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const el = pre as HTMLElement;
      if (el.classList.contains('is-expanded')) {
        el.textContent = el.dataset.shown || '';
        el.classList.remove('is-expanded');
      } else {
        el.textContent = el.dataset.full || el.textContent || '';
        el.classList.add('is-expanded');
      }
    });
  });
  const chev = det.querySelector('.mimo-chev');
  if (chev) chev.textContent = det.open ? '▾' : '▸';
  det.addEventListener('toggle', () => {
    const ch = det.querySelector('.mimo-chev');
    if (ch) ch.textContent = det.open ? '▾' : '▸';
  });
  const metaEl = det.querySelector('.mimo-part-meta');
  metaEl?.addEventListener('dblclick', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const t = inn || metaText || '';
    if (t && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(t);
      if (statusLabel) {
        statusLabel.textContent = 'copied';
        statusLabel.classList.add('is-flash');
        setTimeout(() => statusLabel?.classList.remove('is-flash'), 500);
      }
    }
  });
  return det;
}

function parseInOut(body: string): { inn: string; out: string } {
  const src = String(body || '').replace(/\r\n/g, '\n').trim();
  const m = src.match(/(?:^|\n)OUT:\s*\n?/i);
  if (m && typeof m.index === 'number') {
    const splitAt = m.index + (src[m.index] === '\n' ? 1 : 0);
    const before = src.slice(0, splitAt).replace(/^IN:\s*\n?/i, '').trim();
    const after = src.slice(splitAt).replace(/^OUT:\s*\n?/i, '').trim();
    if (/^OUT:/i.test(src)) return { inn: '', out: src.replace(/^OUT:\s*\n?/i, '').trim() };
    return { inn: before, out: after };
  }
  if (/^IN:/i.test(src)) return { inn: src.replace(/^IN:\s*\n?/i, '').trim(), out: '' };
  return { inn: '', out: src };
}

function looksLikeDiff(t: string): boolean {
  const s = String(t || '');
  return (
    /^(diff |Index: |@@ |\+|-|---|\+\+\+)/m.test(s) ||
    /```diff/.test(s) ||
    (/^\+/.test(s) && /^-/m.test(s))
  );
}

function stripDiffFences(t: string): string {
  return String(t || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/^```diff\n?/, '')
    .replace(/\n?```\s*$/, '');
}

/** Unified CLI-style colored diff (mimocode.json palette). */
function colorDiff(t: string): string {
  const raw = stripDiffFences(t);
  const lines = raw.split('\n');
  return lines
    .map((line, i) => {
      const nl = i < lines.length - 1 ? '\n' : '';
      const e = escHtml(line) + nl;
      if (/^\+/.test(line) && !/^\+\+\+/.test(line))
        return `<span class="mimo-diff-add">${e}</span>`;
      if (/^-/.test(line) && !/^---/.test(line))
        return `<span class="mimo-diff-del">${e}</span>`;
      if (
        /^@@/.test(line) ||
        /^diff /.test(line) ||
        /^Index: /.test(line) ||
        /^---/.test(line) ||
        /^\+\+\+/.test(line) ||
        /^=+$/.test(line)
      )
        return `<span class="mimo-diff-hunk">${e}</span>`;
      return `<span class="mimo-diff-ctx">${e}</span>`;
    })
    .join('');
}

/**
 * CLI/v1 side-by-side: left=removed, right=added (content without +/- prefix).
 * Falls back to unified when narrow or only one side.
 * Port of media/main.js fillDiffPre from 0.6.13.
 */
function renderDiffOut(t: string): string {
  const raw = stripDiffFences(t);
  if (!looksLikeDiff(raw)) {
    return `<pre class="mimo-io-pre">${escHtml(raw)}</pre>`;
  }
  const lines = raw.split('\n');
  const dels: string[] = [];
  const adds: string[] = [];
  for (const line of lines) {
    if (/^\+/.test(line) && !/^\+\+\+/.test(line)) {
      adds.push(line.slice(1));
    } else if (/^-/.test(line) && !/^---/.test(line)) {
      dels.push(line.slice(1));
    }
  }
  const hostW = (chat?.clientWidth || window.innerWidth || 0);
  // CLI uses ≥360; keep slightly lower for sidebar so sbs shows more often
  const wide = hostW >= 340;
  if (wide && (dels.length || adds.length) && dels.length + adds.length >= 1) {
    return (
      `<div class="mimo-diff-split" role="group" aria-label="diff">` +
      `<pre class="mimo-diff-col mimo-diff-col--del"><span class="mimo-diff-col-label">removed</span>${escHtml(
        dels.join('\n') || '—'
      )}</pre>` +
      `<pre class="mimo-diff-col mimo-diff-col--add"><span class="mimo-diff-col-label">added</span>${escHtml(
        adds.join('\n') || '—'
      )}</pre>` +
      `</div>`
    );
  }
  return `<pre class="mimo-io-pre mimo-io-v--diff">${colorDiff(raw)}</pre>`;
}

/** @deprecated name kept for call sites — routes to renderDiffOut */
function renderSideBySideDiff(t: string): string {
  return renderDiffOut(t);
}

function isTableSep(line: string): boolean {
  return /^\s*\|?[\s:\-|]+\|[\s:\-|\|]+\|?\s*$/.test(line) && /[-:]/.test(line);
}
function isTableRow(line: string): boolean {
  return /^\s*\|.+\|\s*$/.test(line) || (/^\s*[^|]+\|.+/.test(line) && line.includes('|'));
}
function renderTable(rows: string[]): string {
  if (rows.length < 2) return rows.map((r) => `<p>${inlineMd(r)}</p>`).join('');
  const parseRow = (line: string) =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());
  const head = parseRow(rows[0]);
  let bodyStart = 1;
  if (isTableSep(rows[1])) bodyStart = 2;
  let html = '<table class="mimo-md-table"><thead><tr>';
  for (const h of head) html += `<th>${inlineMd(h)}</th>`;
  html += '</tr></thead><tbody>';
  for (let i = bodyStart; i < rows.length; i++) {
    if (isTableSep(rows[i])) continue;
    const cells = parseRow(rows[i]);
    html += '<tr>';
    for (let c = 0; c < head.length; c++) {
      html += `<td>${inlineMd(cells[c] || '')}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

function formatMarkdownLite(text: string): string {
  const lines = String(text || '').split(/\n/);
  const blocks: string[] = [];
  let buf: string[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  let tableBuf: string[] = [];
  const flush = () => {
    if (!buf.length) return;
    blocks.push(`<p>${inlineMd(buf.join('\n'))}</p>`);
    buf = [];
  };
  const flushTable = () => {
    if (tableBuf.length >= 2) blocks.push(renderTable(tableBuf));
    else if (tableBuf.length) {
      for (const r of tableBuf) blocks.push(`<p>${inlineMd(r)}</p>`);
    }
    tableBuf = [];
  };
  for (const line of lines) {
    if (/^```/.test(line)) {
      flushTable();
      if (inCode) {
        blocks.push(`<pre><code>${escHtml(codeBuf.join('\n'))}</code></pre>`);
        codeBuf = [];
        inCode = false;
      } else {
        flush();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }
    // GFM table rows
    if (isTableRow(line) || (tableBuf.length && isTableSep(line))) {
      flush();
      tableBuf.push(line);
      continue;
    }
    if (tableBuf.length) flushTable();
    if (line.trim() === '') {
      flush();
      continue;
    }
    const hm = line.match(/^(#{1,3})\s+(.+)$/);
    if (hm) {
      flush();
      const lvl = hm[1].length;
      blocks.push(`<h${lvl}>${inlineMd(hm[2])}</h${lvl}>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      flush();
      blocks.push(`<li data-list="ul">${inlineMd(line.replace(/^[-*]\s+/, ''))}</li>`);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      flush();
      blocks.push(`<li data-list="ol">${inlineMd(line.replace(/^\d+\.\s+/, ''))}</li>`);
      continue;
    }
    buf.push(line);
  }
  if (inCode) blocks.push(`<pre><code>${escHtml(codeBuf.join('\n'))}</code></pre>`);
  flushTable();
  flush();
  let html = blocks.join('\n');
  // Group consecutive <li> into ul/ol by data-list
  html = html.replace(/(?:<li data-list="ul">[\s\S]*?<\/li>\n?)+/g, (m) => {
    return `<ul>${m.replace(/\s*data-list="ul"/g, '')}</ul>`;
  });
  html = html.replace(/(?:<li data-list="ol">[\s\S]*?<\/li>\n?)+/g, (m) => {
    return `<ol>${m.replace(/\s*data-list="ol"/g, '')}</ol>`;
  });
  return html || '';
}

function inlineMd(s: string): string {
  let t = escHtml(s);
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  t = t.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  t = t.replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>');
  t = t.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  t = t.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2" rel="noopener noreferrer" class="mimo-ext-link">$1</a>'
  );
  t = t.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" rel="noopener noreferrer" class="mimo-ext-link">$1</a>'
  );
  return t;
}

function enhanceCodeBlocks(root: HTMLElement): void {
  root.querySelectorAll('pre').forEach((pre) => {
    if (pre.querySelector('.mimo-pre-copy')) return;
    if ((pre as HTMLElement).classList.contains('mimo-io-v')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mimo-pre-copy';
    btn.textContent = 'copy';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const t = pre.textContent || '';
      if (t && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(t);
        btn.textContent = 'ok';
        setTimeout(() => { btn.textContent = 'copy'; }, 700);
      }
    });
    (pre as HTMLElement).style.position = 'relative';
    pre.appendChild(btn);
  });
}

function fillAssistantContent(content: HTMLElement, text: string): void {
  content.innerHTML = '';
  for (const seg of splitMimoParts(text)) {
    content.appendChild(renderPartCard(seg));
  }
  enhanceCodeBlocks(content);
}

function renderMessages(
  messages: DisplayMessage[],
  opts: { loadMore?: boolean; olderCount?: number; pinBottom?: boolean }
): void {
  const prevH = chat.scrollHeight;
  const prevT = chat.scrollTop;
  const collapsed = collapseMessagesForDisplay(messages as any);
  chat.innerHTML = '';
  updateHistoryTopSpacer(chat, opts.olderCount || 0, false);

  for (const msg of collapsed) {
    const el = document.createElement('div');
    el.className = `message ${msg.role === 'user' ? 'user' : 'bot'}`;
    el.dataset.id = msg.id;
    const content = document.createElement('div');
    content.className = 'message-content';
    if (msg.role === 'user') {
      content.innerHTML = formatMarkdownLite(msg.text);
      enhanceCodeBlocks(content);
      /* copy-user-msg */
      el.title = 'Double-click to copy';
      el.addEventListener('dblclick', () => {
        if (navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText(msg.text || '');
          if (statusLabel) {
            statusLabel.textContent = 'copied';
            statusLabel.classList.add('is-flash');
            setTimeout(() => statusLabel?.classList.remove('is-flash'), 500);
          }
        }
      });
    } else {
      fillAssistantContent(content, msg.text);
    }
    el.appendChild(content);
    chat.appendChild(el);
  }

  if (!collapsed.length && !opts.loadMore) {
    const empty = document.createElement('div');
    empty.className = 'mimo-empty-session';
    empty.innerHTML =
      '<div class="mimo-empty-title">Empty session</div>' +
      '<div class="mimo-empty-sub">Type a message or open History for another chat</div>';
    chat.appendChild(empty);
  }

  loadedCount = messages.length;
  const tools = chat.querySelectorAll('.mimo-part').length;
  ensureLoadOlderButton(opts.olderCount || 0);
  post({
    type: 'ui-debug',
    payload: [
      '[WV][RENDER]',
      `msgs=${collapsed.length}`,
      `tools=${tools}`,
      `older=${opts.olderCount || 0}`,
    ],
  });

  if (opts.loadMore) {
    preserveScrollOnPrepend(chat, prevH, prevT);
  } else if (opts.pinBottom !== false) {
    pinBottomUntilSettled(chat, 'sessionData');
  }
}

function appendOrUpdateMessage(msg: DisplayMessage): void {
  if (busy) autoScroll = true;
  let el = chat.querySelector(`.message[data-id="${CSS.escape(msg.id)}"]`) as HTMLElement | null;
  if (!el) {
    el = document.createElement('div');
    el.className = `message ${msg.role === 'user' ? 'user' : 'bot'}`;
    el.dataset.id = msg.id;
    const content = document.createElement('div');
    content.className = 'message-content';
    el.appendChild(content);
    chat.appendChild(el);
  }
  const content = el.querySelector('.message-content') as HTMLElement;
  if (msg.role === 'user') content.innerHTML = formatMarkdownLite(msg.text);
  else fillAssistantContent(content, msg.text || '');
  if (autoScroll || isNearBottom(chat)) scrollToBottom(chat, true);
}


function isJunkClientTitle(title: string): boolean {
  const t = String(title || '').trim();
  if (!t || t.length < 2) return true;
  if (/checkpoint[- ]?writer|previous checkpoint/i.test(t)) return true;
  if (/^untitled|^new session/i.test(t)) return true;
  if (/one[- ]?word greeting|single[- ]word greeting/i.test(t)) return true;
  if (/^(quick\s+)?(one[- ]?word\s+)?greeting/i.test(t)) return true;
  if (/^приветствие(\s+пользователя)?$/i.test(t)) return true;
  if (/math question|^2\s*\+\s*2/i.test(t)) return true;
  if (/^read-only final review|^работай автономно|^продолжи предыдущую/i.test(t))
    return true;
  if (/^ses_[a-zA-Z0-9]+$/i.test(t)) return true;
  return false;
}

function relTime(u?: string): string {
  if (!u) return '';
  const t = Date.parse(u);
  if (!Number.isFinite(t)) return String(u).slice(0, 16);
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return 'just now';
  if (sec < 3600) return Math.floor(sec / 60) + 'm ago';
  if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
  if (sec < 86400 * 14) return Math.floor(sec / 86400) + 'd ago';
  return new Date(t).toLocaleDateString();
}

function showHistoryPanel(sessions: Array<{ id: string; title: string; updated?: string }>): void {
  document.getElementById('mimo-history-panel')?.remove();
  const panel = document.createElement('div');
  panel.id = 'mimo-history-panel';
  panel.className = 'mimo-history-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Session history');

  const head = document.createElement('div');
  head.className = 'mimo-history-head';
  head.innerHTML = `<h3>SESSION HISTORY</h3><button type="button" class="mimo-history-close" id="hist-close">Close</button>`;
  panel.appendChild(head);

  const search = document.createElement('input');
  search.type = 'search';
  search.id = 'hist-search';
  search.className = 'mimo-history-search';
  search.placeholder = 'Filter sessions…';
  search.autocomplete = 'off';
  panel.appendChild(search);

  const list = document.createElement('div');
  list.className = 'mimo-startup-list mimo-history-list';
  const loading = sessions.some((s) => s.id === '_loading');
  const allItems = sessions
    .filter((s) => s.id && s.id !== '_loading' && !isJunkClientTitle(s.title || ''))
    .slice(0, 40);

  const renderList = (q: string) => {
    list.innerHTML = '';
    const qq = q.trim().toLowerCase();
    const items = qq
      ? allItems.filter(
          (s) =>
            (s.title || '').toLowerCase().includes(qq) ||
            (s.id || '').toLowerCase().includes(qq)
        )
      : allItems;
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'mimo-history-empty';
      empty.textContent = loading
        ? 'Loading sessions…'
        : qq
          ? 'No matches'
          : 'No sessions found';
      list.appendChild(empty);
      return;
    }
    for (const s of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mimo-session-card';
      const title = (s.title || s.id).replace(/\s+/g, ' ').trim();
      btn.title = s.id;
      const when = relTime(s.updated);
      btn.innerHTML =
        `<div class="mimo-session-title">${escHtml(title)}</div>` +
        `<div class="mimo-session-meta"><span class="mimo-session-id">${escHtml(s.id)}</span>` +
        (when ? `<span class="mimo-session-when">${escHtml(when)}</span>` : '') +
        `</div>`;
      btn.addEventListener('click', () => {
        panel.remove();
        showLoading(title);
        post({ type: 'selectSession', sessionId: s.id });
      });
      list.appendChild(btn);
    }
  };
  renderList('');
  search.addEventListener('input', () => renderList(search.value));
  panel.appendChild(list);
  setTimeout(() => search.focus(), 30);
  document.body.appendChild(panel);
  panel.querySelector('#hist-close')?.addEventListener('click', () => panel.remove());
  panel.addEventListener('click', (e) => {
    if (e.target === panel) panel.remove();
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      panel.remove();
      window.removeEventListener('keydown', onKey);
    }
  };
  window.addEventListener('keydown', onKey);
}
function showStartup(sessions: Array<{ id: string; title: string; updated?: string }>): void {
  activeSessionId = '';
  titleEl.textContent = 'MiMo Code';
  setInputEnabled(true);
  document.getElementById('mimo-history-panel')?.remove();
  document.getElementById('mimo-startup')?.remove();
  chat.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'mimo-startup';
  root.id = 'mimo-startup';

  const logoHost = document.createElement('div');
  logoHost.className = 'mimo-startup-logo';
  root.appendChild(logoHost);

  const listWrap = document.createElement('div');
  listWrap.className = 'mimo-startup-recent';
  listWrap.innerHTML = '<div class="mimo-startup-label">RECENT SESSIONS</div>';
  const list = document.createElement('div');
  list.className = 'mimo-startup-list';
  const recent = sessions
    .filter((s) => s.id && s.id !== '_loading' && !isJunkClientTitle(s.title || ''))
    .slice(0, 6);
  for (const s of recent) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mimo-session-card';
    const title = (s.title || s.id).replace(/\s+/g, ' ').trim();
    btn.title = s.id;
    const when = relTime(s.updated);
    btn.innerHTML =
      `<div class="mimo-session-title">${escHtml(title)}</div>` +
      (when ? `<div class="mimo-session-when">${escHtml(when)}</div>` : '');
    btn.addEventListener('click', () => {
      showLoading(title);
      post({ type: 'selectSession', sessionId: s.id });
    });
    list.appendChild(btn);
  }
  if (!recent.length) {
    const empty = document.createElement('div');
    empty.className = 'mimo-history-empty';
    empty.style.padding = '12px';
    empty.textContent = 'No recent sessions';
    list.appendChild(empty);
  }
  listWrap.appendChild(list);

  const actions = document.createElement('div');
  actions.className = 'mimo-startup-actions';
  actions.innerHTML = `
    <button type="button" id="btn-history">Show history</button>
    <button type="button" id="btn-refresh">Refresh</button>
    <button type="button" id="btn-new" class="primary">New session</button>`;
  listWrap.appendChild(actions);

  root.appendChild(listWrap);
  chat.appendChild(root);
  try { logoHandle?.destroy(); } catch (_) {}
  logoHandle = paintLogo(logoHost);
  listWrap.querySelector('#btn-refresh')?.addEventListener('click', () =>
    post({ type: 'fetchSessions' })
  );
  listWrap.querySelector('#btn-new')?.addEventListener('click', () => post({ type: 'newSession' }));
  listWrap.querySelector('#btn-history')?.addEventListener('click', () => {
    showHistoryPanel([{ id: '_loading', title: 'Loading…' }]);
    post({ type: 'fetchSessions', history: true });
  });
}

function showLoading(title: string): void {
  titleEl.textContent = title || 'Loading…';
  let ov = document.getElementById('session-load-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'session-load-overlay';
    ov.className = 'session-load-overlay';
    ov.innerHTML =
      `<div class="session-load-overlay-card">` +
      `<div class="mimo-spin" aria-hidden="true"></div>` +
      `<div class="session-load-overlay-text">Loading session…</div>` +
      `<div class="session-load-overlay-sub">${escHtml(title || 'DB-first tail')}</div>` +
      `</div>`;
    // body-level so it covers chat + isn't clipped
    document.body.appendChild(ov);
  } else {
    const sub = ov.querySelector('.session-load-overlay-sub');
    if (sub) sub.textContent = title || 'DB-first tail';
  }
}

function hideLoading(): void {
  document.getElementById('session-load-overlay')?.remove();
}

function setInputEnabled(on: boolean): void {
  if (promptEl) promptEl.disabled = !on || busy;
  if (btnSend) btnSend.disabled = !on || busy;
}

function showToast(msg: string, ms = 1400): void {
  document.getElementById('mimo-toast')?.remove();
  const t = document.createElement('div');
  t.id = 'mimo-toast';
  t.className = 'mimo-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

function setBusy(on: boolean): void {
  busy = on;
  setInputEnabled(true);
  if (btnAbort) btnAbort.hidden = !on;
  document.body.classList.toggle('mimo-busy', on);
  if (btnSend) btnSend.classList.toggle('is-busy', on);
  // Keep server status if present; only override when running
  if (statusLabel) {
    if (on) {
      const n = document.querySelectorAll('.message.is-streaming .mimo-part').length;
      statusLabel.textContent = n > 0 ? `running · ${n} tools` : 'running…';
    } else if (statusLabel.dataset.server) {
      statusLabel.textContent = statusLabel.dataset.server;
    } else {
      statusLabel.textContent = 'v2';
    }
  }
}

function fillSelect(
  el: HTMLSelectElement | null,
  items: Array<{ id: string; label: string }>,
  selected: string
): void {
  if (!el) return;
  el.innerHTML = '';
  for (const it of items) {
    const o = document.createElement('option');
    o.value = it.id;
    o.textContent = it.label;
    if (it.id === selected) o.selected = true;
    el.appendChild(o);
  }
}


function handleLocalSlash(full: string): boolean {
  const m = full.trim().match(/^\/([a-zA-Z0-9_-]+)(?:\s+(.*))?$/);
  if (!m) return false;
  const cmd = m[1].toLowerCase();
  const rest = (m[2] || '').trim();
  if (cmd === 'fork') {
    post({ type: 'forkSession' });
    return true;
  }
  if (cmd === 'new') {
    post({ type: 'newSession' });
    return true;
  }
  if (cmd === 'home') {
    post({ type: 'goHome' });
    return true;
  }
  if (cmd === 'clear') {
    chat.innerHTML = '';
    loadedCount = 0;
    (window as any).__mimoOlderCount = 0;
    if (activeSessionId) {
      const empty = document.createElement('div');
      empty.className = 'mimo-empty-session';
      empty.innerHTML =
        '<div class="mimo-empty-title">View cleared</div>' +
        '<div class="mimo-empty-sub">Session kept — send a message or open History</div>';
      chat.appendChild(empty);
    } else {
      showStartup([]);
      post({ type: 'goHome' });
    }
    if (statusLabel) statusLabel.textContent = 'cleared';
    return true;
  }
  if (cmd === 'agent' || cmd === 'mode') {
    if (rest) {
      selectedMode = rest.split(/\s+/)[0];
      if (modeSelect) {
        const opt = Array.from(modeSelect.options).find(
          (o) => o.value === selectedMode || o.textContent === selectedMode
        );
        if (opt) modeSelect.value = opt.value;
        else {
          const o = document.createElement('option');
          o.value = selectedMode;
          o.textContent = selectedMode;
          modeSelect.appendChild(o);
          modeSelect.value = selectedMode;
        }
      }
      post({ type: 'setMode', mode: selectedMode });
      if (statusLabel) statusLabel.textContent = 'mode ' + selectedMode;
    } else if (modeSelect) {
      modeSelect.focus();
    }
    return true;
  }
  if (cmd === 'sessions' || cmd === 'history') {
    showHistoryPanel([{ id: '_loading', title: 'Loading…' }]);
    post({ type: 'fetchSessions', history: true });
    return true;
  }
  if (cmd === 'retry') {
    const t = lastUserPrompt || rest;
    if (!t) {
      if (statusLabel) statusLabel.textContent = 'nothing to retry';
      return true;
    }
    post({
      type: 'sendPrompt',
      text: t,
      sessionId: activeSessionId || undefined,
      mode: selectedMode,
      model: selectedModel || undefined,
    });
    return true;
  }
  if (cmd === 'stop' || cmd === 'abort') {
    post({ type: 'abort' });
    return true;
  }
  if (cmd === 'plan' || cmd === 'build' || cmd === 'compose') {
    selectedMode = cmd;
    if (modeSelect) modeSelect.value = cmd;
    post({ type: 'setMode', mode: cmd });
    if (rest) {
      post({
        type: 'sendPrompt',
        text: rest,
        sessionId: activeSessionId || undefined,
        mode: cmd,
        model: selectedModel || undefined,
      });
    }
    return true;
  }
  if (cmd === 'models' || (cmd === 'model' && !rest)) {
    post({ type: 'refreshModels' });
    if (statusLabel) statusLabel.textContent = 'models…';
    return true;
  }
  if (cmd === 'model' && rest) {
    selectedModel = rest;
    if (modelSelect) {
      const opt = Array.from(modelSelect.options).find(
        (o) => o.value === rest || o.textContent === rest || o.value.endsWith('/' + rest)
      );
      if (opt) modelSelect.value = opt.value;
      else {
        const o = document.createElement('option');
        o.value = rest;
        o.textContent = rest;
        modelSelect.appendChild(o);
        modelSelect.value = rest;
      }
    }
    post({ type: 'setModel', model: selectedModel });
    return true;
  }
  if (cmd === 'undo' || cmd === 'redo') {
    post({ type: cmd === 'undo' ? 'undoLast' : 'redoLast' });
    // Also inform agent for session-aware undo when git engine incomplete
    if (activeSessionId) {
      post({
        type: 'sendPrompt',
        text: '/' + cmd + (rest ? ' ' + rest : ''),
        sessionId: activeSessionId,
        mode: selectedMode,
        model: selectedModel || undefined,
      });
    }
    return true;
  }
  if (cmd === 'cost' || cmd === 'status' || cmd === 'usage') {
    if (activeSessionId) post({ type: 'refreshUsage', sessionId: activeSessionId });
    const tools = document.querySelectorAll('.mimo-part').length;
    const msgs = document.querySelectorAll('.message').length;
    const lines = [
      `**Status**`,
      `- session: \`${activeSessionId || '(home)'}\``,
      `- mode: \`${selectedMode || '—'}\` · model: \`${selectedModel || '—'}\``,
      `- messages: ${msgs} · tools: ${tools} · busy: ${busy ? 'yes' : 'no'}`,
      `- version: \`${statusLabel?.dataset.server || 'v2'}\``,
    ];
    appendOrUpdateMessage({
      id: 'sys_status_' + Date.now(),
      role: 'assistant',
      text: lines.join('\n'),
    });
    if (statusLabel) statusLabel.textContent = 'usage…';
    return true;
  }
  if (cmd === 'details') {
    const parts = Array.from(document.querySelectorAll('details.mimo-part')) as HTMLDetailsElement[];
    const anyClosed = parts.some((p) => !p.open);
    parts.forEach((p) => { p.open = anyClosed; });
    if (statusLabel) statusLabel.textContent = anyClosed ? 'details open' : 'details closed';
    return true;
  }
  if (cmd === 'export' || cmd === 'copy' || cmd === 'share') {
    const parts: string[] = [];
    document.querySelectorAll('.message').forEach((el) => {
      const role = el.classList.contains('user') ? 'user' : 'assistant';
      const text = (el.querySelector('.message-content') as HTMLElement)?.innerText || '';
      if (text.trim()) parts.push('## ' + role + '\n' + text.trim());
    });
    const blob = parts.join('\n\n---\n\n');
    if (blob && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(blob);
      if (statusLabel) {
        statusLabel.textContent = 'exported';
        statusLabel.classList.add('is-flash');
        setTimeout(() => statusLabel?.classList.remove('is-flash'), 700);
      }
    } else if (statusLabel) statusLabel.textContent = 'nothing to export';
    return true;
  }
  if (cmd === 'help') {
    appendOrUpdateMessage({
      id: 'sys_help_' + Date.now(),
      role: 'assistant',
      text:
        '**Local commands**\n' +
        '- `/home` `/new` `/fork` `/clear` `/sessions` `/history` `/stop`\n' +
        '- `/plan` `/build` `/compose` `/agent <mode>` `/model` `/models`\n' +
        '- `/undo` `/retry` `/details` `/cost` `/status` `/usage` `/help`\n' +
        '- Hotkeys: `Ctrl+Shift+H` history · `Ctrl+Shift+N` new · `Ctrl+Shift+L` clear · `Ctrl+Shift+U` home · `Ctrl+.` abort\n\n' +
        '**Agent skills:** type `/` for full catalog (arxiv, deep-research, …).',
    });
    return true;
  }
  // unknown slash still sent to agent with leading /
  return false;
}
function doSend(): void {
  const text = (promptEl?.value || '').trim();
  if (!text || busy) return;
  if (handleLocalSlash(text)) { promptEl.value = ''; hideSlash(); return; }
  lastUserPrompt = text;
  promptEl.value = '';
  autoResizePrompt();
  if (statusLabel) statusLabel.textContent = 'sending…';
  post({
    type: 'sendPrompt',
    text,
    sessionId: activeSessionId || undefined,
    mode: selectedMode,
    model: selectedModel || undefined,
  });
}

function requestLoadMore(force = false): void {
  if (!activeSessionId || loadMoreInFlight) return;
  const older = Number((window as any).__mimoOlderCount || 0);
  const exhausted = (window as any).__mimoLoadMoreExhausted === true;
  if (exhausted && !force) return;
  if (older <= 0 && !force && loadedCount < 12) return;
  const now = Date.now();
  if (!force && now - loadMoreCooldown < 350) return;
  loadMoreCooldown = now;
  loadMoreInFlight = true;
  updateHistoryTopSpacer(chat, Math.max(older, 1), true);
  const btn = document.getElementById('mimo-load-older-btn');
  if (btn) btn.textContent = 'Loading older…';
  post({
    type: 'loadMoreSession',
    sessionId: activeSessionId,
    count: Math.max(loadedCount, 36) + 48,
  });
}

function ensureLoadOlderButton(olderCount: number): void {
  let bar = document.getElementById('mimo-load-older');
  if (olderCount <= 0) {
    bar?.remove();
    return;
  }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'mimo-load-older';
    bar.className = 'mimo-load-older';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'mimo-load-older-btn';
    btn.className = 'mimo-load-older-btn';
    btn.addEventListener('click', () => requestLoadMore(true));
    bar.appendChild(btn);
    chat.insertBefore(bar, chat.firstChild);
  }
  const btn = document.getElementById('mimo-load-older-btn');
  if (btn) btn.textContent = `↑ Load older (${olderCount})`;
}

function onScroll(): void {
  autoScroll = isNearBottom(chat);
  if (!activeSessionId) return;
  // Near top of chat → fetch older messages (CLI-style history)
  if (chat.scrollTop < 360) requestLoadMore(false);
}

chat.addEventListener('scroll', onScroll, { passive: true });
chat.addEventListener('click', (e) => {
  const t = e.target as HTMLElement | null;
  const a = t?.closest?.('a') as HTMLAnchorElement | null;
  if (!a || !a.href || !/^https?:/i.test(a.href)) return;
  e.preventDefault();
  e.stopPropagation();
  post({ type: 'openExternalUrl', url: a.href });
});
btnHome?.addEventListener('click', () => {
  // Home = logo + recent sessions, NOT a blank new session
  activeSessionId = '';
  titleEl.textContent = 'MiMo Code';
  document.getElementById('mimo-history-panel')?.remove();
  chat.innerHTML = '';
  // Optimistic home paint while host reloads session list
  showStartup([]);
  post({ type: 'goHome' });
});
btnUndo?.addEventListener('click', () => post({ type: 'undoLast' }));
btnFork?.addEventListener('click', () => post({ type: 'forkSession' }));
btnHistoryTop?.addEventListener('click', () => {
  // Instant feedback so History never feels "dead"
  showHistoryPanel([{ id: '_loading', title: 'Loading…' }]);
  const empty = document.querySelector('#mimo-history-panel .mimo-session-id');
  if (empty) (empty as HTMLElement).textContent = '…';
  post({ type: 'fetchSessions', history: true });
});
btnSend?.addEventListener('click', doSend);
btnAbort?.addEventListener('click', () => post({ type: 'abort' }));
function autoResizePrompt(): void {
  if (!promptEl) return;
  promptEl.style.height = 'auto';
  const h = Math.min(160, Math.max(44, promptEl.scrollHeight));
  promptEl.style.height = h + 'px';
}
promptEl?.addEventListener('input', () => {
  autoResizePrompt();
  onPromptInput();
});
promptEl?.addEventListener('keydown', (e) => {
  if (!document.getElementById('slash-overlay')?.hidden) {
    const items = Array.from(document.querySelectorAll('.slash-item'));
    if (e.key === 'ArrowDown') { e.preventDefault(); slashIndex = Math.min(items.length - 1, slashIndex + 1); onPromptInput(); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); slashIndex = Math.max(0, slashIndex - 1); onPromptInput(); return; }
    if (e.key === 'Tab' || (e.key === 'Enter' && items[slashIndex])) { e.preventDefault(); applySlash((items[slashIndex] as HTMLElement).dataset.name || ''); return; }
    if (e.key === 'Escape') { hideSlash(); return; }
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    doSend();
  }
});

// Global shortcuts (CLI-ish)
window.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  // Escape closes top overlay first
  if (e.key === 'Escape') {
    const hist = document.getElementById('mimo-history-panel');
    if (hist) {
      hist.remove();
      e.preventDefault();
      return;
    }
    if (document.getElementById('permission-overlay') || document.getElementById('question-overlay')) {
      return; // leave explicit dismiss to card buttons
    }
    hideSlash();
    return;
  }
  if (!mod) return;
  const k = e.key.toLowerCase();
  // Ctrl/Cmd+Shift+H → history
  if (e.shiftKey && k === 'h') {
    e.preventDefault();
    showHistoryPanel([{ id: '_loading', title: 'Loading…' }]);
    post({ type: 'fetchSessions', history: true });
    return;
  }
  // Ctrl/Cmd+Shift+N → new session
  if (e.shiftKey && k === 'n') {
    e.preventDefault();
    post({ type: 'newSession' });
    return;
  }
  // Ctrl/Cmd+Shift+U → home
  if (e.shiftKey && k === 'l') {
    e.preventDefault();
    handleLocalSlash('/clear');
    return;
  }
  if (e.shiftKey && k === 'u') {
    e.preventDefault();
    activeSessionId = '';
    titleEl.textContent = 'MiMo Code';
    document.getElementById('mimo-history-panel')?.remove();
    chat.innerHTML = '';
    showStartup([]);
    post({ type: 'goHome' });
    return;
  }
  // Ctrl/Cmd+. → abort when busy
  if (k === '.' && busy) {
    e.preventDefault();
    post({ type: 'abort' });
  }
});
modeSelect?.addEventListener('change', () => {
  selectedMode = modeSelect.value;
  post({ type: 'setMode', mode: selectedMode });
});
modelSelect?.addEventListener('change', () => {
  selectedModel = modelSelect.value;
  post({ type: 'setModel', model: selectedModel });
});

window.addEventListener('message', (event: MessageEvent) => {
  const message = event.data;
  if (!message || typeof message.type !== 'string') return;
  switch (message.type) {
    case 'init': {
      if (Array.isArray(message.slashCommands)) slashCatalog = message.slashCommands;
      if (message.version && statusLabel && !busy) {
        statusLabel.dataset.server = String(message.version);
        if (!statusLabel.textContent || statusLabel.textContent === 'v2') {
          statusLabel.textContent = String(message.version);
        }
      }
if (Array.isArray(message.modes) && message.modes.length) {
        fillSelect(
          modeSelect,
          message.modes.map((m: string) => ({ id: m, label: m })),
          message.selectedMode || selectedMode
        );
        selectedMode = message.selectedMode || message.modes[0];
      }
      if (Array.isArray(message.models) && message.models.length) {
        fillSelect(
          modelSelect,
          message.models.map((m: any) => ({
            id: m.fullId,
            label: m.name || m.fullId,
          })),
          message.selectedModel || selectedModel
        );
        selectedModel = message.selectedModel || message.models[0]?.fullId || '';
      }
      // Home / goHome always forces startup (logo + recent). metadataOnly only
      // refreshes models when a session is open AND host is not asking for home.
      if (message.metadataOnly && activeSessionId && message.showStartupChooser !== true) {
        break;
      }
      if (message.showStartupChooser === true) {
        activeSessionId = '';
        titleEl.textContent = 'MiMo Code';
        showStartup(Array.isArray(message.sessions) ? message.sessions : []);
      } else if (message.showStartupChooser !== false && !activeSessionId) {
        showStartup(Array.isArray(message.sessions) ? message.sessions : []);
      }
      break;
    }
    case 'sessionsList':
      if (message.historyPanel) {
        // Always open history overlay (even mid-session)
        showHistoryPanel(Array.isArray(message.sessions) ? message.sessions : []);
      } else if (!activeSessionId) {
        showStartup(Array.isArray(message.sessions) ? message.sessions : []);
      }
      break;
    case 'sessionData': {
      hideLoading();
      const sid = message.sessionId as string;
      activeSessionId = sid;
      titleEl.textContent = message.title || sid;
      document.getElementById('mimo-startup')?.remove();
      const meta = message.meta || {};
      const older = Number(meta.olderCount || 0);
      (window as any).__mimoOlderCount = older;
      (window as any).__mimoLoadMoreExhausted = older <= 0;
      renderMessages(message.messages || [], {
        loadMore: meta.loadMore === true || meta.source === 'loadMore',
        olderCount: older,
        pinBottom: meta.pinBottom !== false && meta.source !== 'loadMore',
      });
      loadMoreInFlight = false;
      setInputEnabled(true);
      setTimeout(() => promptEl?.focus(), 40);
      break;
    }
    case 'appendMessage':
      if (message.sessionId && message.sessionId !== activeSessionId) {
        activeSessionId = message.sessionId;
        document.getElementById('mimo-startup')?.remove();
      }
      if (message.message) appendOrUpdateMessage(message.message);
      break;
    case 'streamUpdate':
      if (message.sessionId && activeSessionId && message.sessionId !== activeSessionId) break;
      appendOrUpdateMessage({
        id: message.messageId || 'live',
        role: 'assistant',
        text: message.text || '',
      });
      document
        .querySelector(`.message[data-id="${CSS.escape(String(message.messageId || 'live'))}"]`)
        ?.classList.add('is-streaming');
      if (busy && statusLabel) {
        const n = document.querySelectorAll('.message.is-streaming .mimo-part').length;
        statusLabel.textContent = n > 0 ? 'running · ' + n + ' tools' : 'running…';
      }
      break;
    case 'streamDone':
      setBusy(false);
      if (statusLabel) {
        statusLabel.classList.add('is-flash');
        setTimeout(() => statusLabel?.classList.remove('is-flash'), 600);
      }
      document.querySelectorAll('.message.is-streaming').forEach((el) => {
        el.classList.remove('is-streaming');
        // Collapse thoughts after turn ends (CLI collapses finished thought)
        el.querySelectorAll('details.mimo-thinking[open]').forEach((d) => {
          (d as HTMLDetailsElement).open = false;
        });
      });
      if (message.text) {
        appendOrUpdateMessage({
          id: message.messageId || 'live',
          role: 'assistant',
          text: message.text,
        });
      }
      break;
    case 'sendState':
      setBusy(message.busy === true);
      break;
    case 'sessionLoadMoreStatus':
      loadMoreInFlight = message.loading === true;
      if (typeof message.olderCount === 'number') {
        (window as any).__mimoOlderCount = message.olderCount;
        (window as any).__mimoLoadMoreExhausted = message.olderCount <= 0;
        updateHistoryTopSpacer(chat, message.olderCount, message.loading === true);
        if (message.loading === false) ensureLoadOlderButton(message.olderCount);
      }
      if (message.loading === false && message.error) {
        loadMoreInFlight = false;
        (window as any).__mimoLoadMoreExhausted = true;
        const btn = document.getElementById('mimo-load-older-btn');
        if (btn) btn.textContent = 'Load failed — tap to retry';
      }
      break;
    case 'sessionLoadFailed': {
      hideLoading();
      loadMoreInFlight = false;
      const err = String(message.error || 'unknown');
      const sid = String(message.sessionId || activeSessionId || '');
      chat.innerHTML =
        `<div class="mimo-error-card">` +
        `<div class="mimo-error-title">Failed to load session</div>` +
        `<div class="mimo-error-body">${escHtml(err)}</div>` +
        `<div class="mimo-error-actions">` +
        (sid
          ? `<button type="button" id="err-retry" class="primary">Retry</button>`
          : '') +
        `<button type="button" id="err-home">Home</button>` +
        `</div></div>`;
      document.getElementById('err-retry')?.addEventListener('click', () => {
        if (sid) {
          showLoading('Retrying…');
          post({ type: 'selectSession', sessionId: sid });
        }
      });
      document.getElementById('err-home')?.addEventListener('click', () => {
        activeSessionId = '';
        post({ type: 'goHome' });
      });
      break;
    }
    case 'error':
      setBusy(false);
      if (statusLabel) {
        statusLabel.textContent = String(message.error || 'error').slice(0, 40);
        statusLabel.classList.add('is-flash');
        setTimeout(() => statusLabel?.classList.remove('is-flash'), 900);
      }
      break;
    case 'permissionRequest':
      if (message.permissionId) {
        showPermission({
          sessionId: message.sessionId,
          permissionId: message.permissionId,
          permission: message.permission,
          patterns: message.patterns,
        });
      }
      break;
    case 'permissionCleared':
      document.getElementById('permission-overlay')?.remove();
      break;
    case 'questionOverlay':
      showQuestion({
        sessionId: message.sessionId,
        callId: message.callId,
        requestId: message.requestId,
        title: message.title,
        prompt: message.prompt,
        options: Array.isArray(message.options) ? message.options : [],
        questions: Array.isArray(message.questions) ? message.questions : [],
      });
      break;
    case 'questionCleared':
      document.getElementById('question-overlay')?.remove();
      break;
    case 'sessionTitle': {
      const t = String(message.title || '').trim();
      if (t && (!message.sessionId || message.sessionId === activeSessionId)) {
        titleEl.textContent = t;
      }
      break;
    }
    case 'sessionUsage': {
      if (statusLabel && !busy) {
        const used = Number(message.used || 0);
        const size = Number(message.size || 0);
        let t = '';
        if (used && size) t = Math.round((used / size) * 100) + '% ctx';
        else if (used) t = (used >= 1000 ? (used / 1000).toFixed(1) + 'k' : String(used)) + ' tok';
        if (message.amount) t += (t ? ' · ' : '') + '$'+Number(message.amount).toFixed(2);
        if (t) {
          statusLabel.dataset.server = t;
          statusLabel.textContent = t;
        }
      }
      break;
    }
    case 'serverStatus':
      if (statusLabel) {
        const st = String(message.status || '');
        let t = st;
        if (st === 'reconnecting') t = 'reconnecting…';
        else if (st === 'connected') t = message.detail ? String(message.detail).slice(0, 28) : 'connected';
        else t = `${st}${message.detail ? ' ' + message.detail : ''}`.slice(0, 48);
        statusLabel.dataset.server = t;
        if (!busy) {
          statusLabel.textContent = t || 'v2';
          if (st === 'reconnecting') statusLabel.classList.add('is-flash');
          else statusLabel.classList.remove('is-flash');
        }
      }
      break;
  }
});

try { starfieldHandle?.destroy(); } catch (_) {}
starfieldHandle = startStarfield(document.getElementById('starfield') as HTMLCanvasElement | null);

// ---- Slash palette ----
let slashCatalog: Array<{ name: string; description: string }> = [];
let slashIndex = 0;

function ensureSlashOverlay(): HTMLElement {
  let el = document.getElementById('slash-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'slash-overlay';
    el.className = 'slash-overlay';
    el.hidden = true;
    document.querySelector('.input-area')?.prepend(el);
  }
  return el;
}

function hideSlash(): void {
  const el = document.getElementById('slash-overlay');
  if (el) el.hidden = true;
  slashIndex = 0;
}

function showSlash(filter: string): void {
  const el = ensureSlashOverlay();
  const q = filter.toLowerCase();
  // Prefer prefix matches, then substring; de-dupe by name
  const seen = new Set<string>();
  const ranked = (slashCatalog || [])
    .filter((c) => {
      const n = c.name.toLowerCase();
      if (seen.has(n)) return false;
      seen.add(n);
      if (!q) return true;
      return n.startsWith(q) || n.includes(q) || (c.description || '').toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (!q) return a.name.localeCompare(b.name);
      const an = a.name.toLowerCase();
      const bn = b.name.toLowerCase();
      const ap = an.startsWith(q) ? 0 : 1;
      const bp = bn.startsWith(q) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return an.length - bn.length || an.localeCompare(bn);
    })
    .slice(0, 28);
  if (!ranked.length) {
    el.hidden = true;
    return;
  }
  if (slashIndex >= ranked.length) slashIndex = 0;
  el.innerHTML = ranked
    .map(
      (c, i) =>
        `<div class="slash-item${i === slashIndex ? ' active' : ''}" data-name="${escHtml(c.name)}"><span class="slash-name">/${escHtml(c.name)}</span><span class="slash-desc">${escHtml(c.description || '')}</span></div>`
    )
    .join('');
  el.hidden = false;
  el.querySelectorAll('.slash-item').forEach((node) => {
    node.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const name = (node as HTMLElement).dataset.name || '';
      applySlash(name);
    });
  });
  // Keep active item visible
  el.querySelector('.slash-item.active')?.scrollIntoView({ block: 'nearest' });
}

function applySlash(name: string): void {
  if (!promptEl) return;
  const v = promptEl.value;
  const m = v.match(/^(.*?)(\/\S*)$/);
  if (m) promptEl.value = m[1] + '/' + name + ' ';
  else promptEl.value = '/' + name + ' ';
  hideSlash();
  promptEl.focus();
}

function onPromptInput(): void {
  const v = promptEl?.value || '';
  const m = v.match(/(?:^|\s)(\/([^\s]*))$/);
  if (m) showSlash(m[2] || '');
  else hideSlash();
}

function showPermission(req: {
  sessionId?: string;
  permissionId: string;
  permission?: string;
  patterns?: string[];
}): void {
  document.getElementById('permission-overlay')?.remove();
  const ov = document.createElement('div');
  ov.id = 'permission-overlay';
  ov.className = 'permission-overlay';
  const pats = (req.patterns || []).slice(0, 6).map((p) => escHtml(p)).join('<br/>');
  ov.innerHTML = `
    <div class="permission-card">
      <div class="permission-title">Permission</div>
      <div class="permission-body">${escHtml(req.permission || 'allow tool')} ${pats ? '<div class="permission-pats">' + pats + '</div>' : ''}</div>
      <div class="permission-actions">
        <button type="button" data-r="once">Allow once <kbd>1</kbd></button>
        <button type="button" data-r="always">Always <kbd>2</kbd></button>
        <button type="button" data-r="reject" class="danger">Reject <kbd>3</kbd></button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const reply = (r: string) => {
    post({
      type: 'permissionReply',
      sessionId: req.sessionId || activeSessionId,
      permissionId: req.permissionId,
      response: r,
    });
    ov.remove();
    window.removeEventListener('keydown', onPermKey);
    if (statusLabel) {
      statusLabel.textContent =
        r === 'reject' ? 'rejected' : r === 'always' ? 'allowed always' : 'allowed once';
      statusLabel.classList.add('is-flash');
      setTimeout(() => statusLabel?.classList.remove('is-flash'), 800);
    }
  };
  ov.querySelectorAll('button[data-r]').forEach((b) => {
    b.addEventListener('click', () => reply((b as HTMLElement).dataset.r || 'once'));
  });
  /* perm-keys */
  const onPermKey = (e: KeyboardEvent) => {
    if (e.key === '1' || e.key === 'o') { e.preventDefault(); reply('once'); }
    else if (e.key === '2' || e.key === 'a') { e.preventDefault(); reply('always'); }
    else if (e.key === '3' || e.key === 'r' || e.key === 'Escape') {
      e.preventDefault();
      reply('reject');
    }
  };
  window.addEventListener('keydown', onPermKey);
}

function showQuestion(req: {
  sessionId?: string;
  callId: string;
  requestId?: string;
  title?: string;
  prompt?: string;
  options: Array<{ label: string; description?: string; value?: string }>;
  questions: Array<{
    title: string;
    prompt: string;
    options: Array<{ label: string; description?: string; value?: string }>;
    multiple?: boolean;
  }>;
}): void {
  document.getElementById('question-overlay')?.remove();
  const items =
    req.questions && req.questions.length
      ? req.questions
      : [
          {
            title: req.title || 'Question',
            prompt: req.prompt || '',
            options: req.options || [],
            multiple: false,
          },
        ];
  const ov = document.createElement('div');
  ov.id = 'question-overlay';
  ov.className = 'permission-overlay question-overlay';
  const card = document.createElement('div');
  card.className = 'permission-card question-card';
  const answers: string[][] = items.map(() => []);

  items.forEach((q, qi) => {
    const block = document.createElement('div');
    block.className = 'question-block';
    block.innerHTML = `<div class="permission-title">${escHtml(q.title || 'Question')}</div>
      <div class="permission-body">${escHtml(q.prompt || '')}</div>`;
    const list = document.createElement('div');
    list.className = 'question-options';
    (q.options || []).forEach((opt, oi) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'question-opt';
      btn.innerHTML = `<span class="question-opt-label">${escHtml(opt.label)}</span>${
        opt.description
          ? `<span class="question-opt-desc">${escHtml(opt.description)}</span>`
          : ''
      }`;
      btn.addEventListener('click', () => {
        const val = opt.value || opt.label;
        if (q.multiple) {
          const idx = answers[qi].indexOf(val);
          if (idx >= 0) {
            answers[qi].splice(idx, 1);
            btn.classList.remove('selected');
          } else {
            answers[qi].push(val);
            btn.classList.add('selected');
          }
        } else {
          answers[qi] = [val];
          list.querySelectorAll('.question-opt').forEach((b) => b.classList.remove('selected'));
          btn.classList.add('selected');
        }
      });
      list.appendChild(btn);
    });
    block.appendChild(list);
    card.appendChild(block);
  });

  const actions = document.createElement('div');
  actions.className = 'permission-actions';
  const submit = document.createElement('button');
  submit.type = 'button';
  submit.textContent = 'Submit';
  submit.addEventListener('click', () => {
    // Flatten: single-select → one value; multi → join with | for CLI-compat
    const flat = answers
      .map((a) => (a.length > 1 ? a.join('|') : a[0] || ''))
      .filter(Boolean);
    if (!flat.length && items[0]?.options?.[0]) {
      flat.push(items[0].options[0].value || items[0].options[0].label);
    }
    post({
      type: 'questionReply',
      sessionId: req.sessionId || activeSessionId,
      callId: req.callId,
      requestId: req.requestId,
      answers: flat,
    });
    ov.remove();
    if (statusLabel) {
      statusLabel.textContent = 'answered';
      statusLabel.classList.add('is-flash');
      setTimeout(() => statusLabel?.classList.remove('is-flash'), 600);
    }
  });
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'danger';
  cancel.textContent = 'Skip';
  cancel.addEventListener('click', () => {
    post({
      type: 'questionReply',
      sessionId: req.sessionId || activeSessionId,
      callId: req.callId,
      requestId: req.requestId,
      answers: ['skip'],
    });
    ov.remove();
  });
  actions.appendChild(submit);
  actions.appendChild(cancel);
  card.appendChild(actions);
  ov.appendChild(card);
  document.body.appendChild(ov);
}

post({ type: 'ready' });

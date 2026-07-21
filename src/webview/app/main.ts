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
const btnSend = document.getElementById('btn-send') as HTMLButtonElement;
const btnAbort = document.getElementById('btn-abort') as HTMLButtonElement | null;
const promptEl = document.getElementById('prompt') as HTMLTextAreaElement;
const modeSelect = document.getElementById('mode-select') as HTMLSelectElement | null;
const modelSelect = document.getElementById('model-select') as HTMLSelectElement | null;
const statusLabel = document.getElementById('status-label') as HTMLElement | null;

let activeSessionId = '';
let loadedCount = 0;
let loadMoreInFlight = false;
let loadMoreCooldown = 0;
let busy = false;
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
    det.open = false;
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
      d.className = 'mimo-dur';
      d.textContent = dur;
      summary.appendChild(d);
    }
    if (words) {
      const w = document.createElement('span');
      w.className = 'mimo-thinking-hint';
      w.textContent = words + ' words';
      summary.appendChild(w);
    }
    det.appendChild(summary);
    const body = document.createElement('div');
    body.className = 'mimo-thinking-body';
    body.textContent = bodyText;
    det.appendChild(body);
    return det;
  }
  // Flat CLI tool card (v1 main.js) — NO nested rounded windows
  const det = document.createElement('details');
  det.className = 'mimo-part mimo-part--flat';
  det.open = Boolean((seg as any).open);
  const titleRaw = String((seg as any).title || seg.kind);
  const title = escHtml(titleRaw);
  const meta = escHtml((seg as any).meta || '');
  const body = String((seg as any).body || '');
  const { inn, out } = parseInOut(body);
  const isDiff =
    looksLikeDiff(out) ||
    seg.kind === 'patch' ||
    /^(write|edit)$/i.test(titleRaw);
  let bodyHtml = '';
  if (inn) {
    // label "in"/"file" + bare pre — no box
    const inLab = isDiff || seg.kind === 'patch' ? 'file' : 'in';
    bodyHtml += `<div class="mimo-io-line mimo-io-line--in"><span class="mimo-io-k">${inLab}</span><pre class="mimo-io-v mimo-io-v--cmd">${escHtml(inn)}</pre></div>`;
  }
  if (inn && out) bodyHtml += `<div class="mimo-io-hr" role="separator"></div>`;
  if (out) {
    const outLab = isDiff ? 'diff' : 'out';
    bodyHtml += `<div class="mimo-io-line mimo-io-line--out"><span class="mimo-io-k">${outLab}</span>${
      isDiff ? renderDiffOut(out) : `<pre class="mimo-io-v">${escHtml(out)}</pre>`
    }</div>`;
  }
  det.innerHTML = `<summary><span class="mimo-chev" aria-hidden="true">▸</span><span class="mimo-part-title">${title}</span>${
    meta ? `<span class="mimo-part-meta">${meta}</span>` : ''
  }</summary><div class="mimo-part-body"><div class="mimo-io mimo-io--flat">${bodyHtml}</div></div>`;
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
      blocks.push(`<li>${inlineMd(line.replace(/^[-*]\s+/, ''))}</li>`);
      continue;
    }
    buf.push(line);
  }
  if (inCode) blocks.push(`<pre><code>${escHtml(codeBuf.join('\n'))}</code></pre>`);
  flushTable();
  flush();
  let html = blocks.join('\n');
  html = html.replace(/(?:<li>[\s\S]*?<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);
  return html || '';
}

function inlineMd(s: string): string {
  let t = escHtml(s);
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2" rel="noopener">$1</a>'
  );
  t = t.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" rel="noopener">$1</a>');
  return t;
}

function fillAssistantContent(content: HTMLElement, text: string): void {
  content.innerHTML = '';
  for (const seg of splitMimoParts(text)) {
    content.appendChild(renderPartCard(seg));
  }
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
    } else {
      fillAssistantContent(content, msg.text);
    }
    el.appendChild(content);
    chat.appendChild(el);
  }

  loadedCount = messages.length;
  const tools = chat.querySelectorAll('.mimo-part').length;
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

  const list = document.createElement('div');
  list.className = 'mimo-startup-list mimo-history-list';
  const items = sessions.slice(0, 40);
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'mimo-history-empty';
    empty.textContent = 'No sessions found';
    list.appendChild(empty);
  }
  for (const s of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mimo-session-card';
    btn.innerHTML = `<div class="mimo-session-title">${escHtml(s.title || s.id)}</div><div class="mimo-session-id">${escHtml(s.id)}</div>`;
    btn.addEventListener('click', () => {
      panel.remove();
      showLoading(s.title || s.id);
      post({ type: 'selectSession', sessionId: s.id });
    });
    list.appendChild(btn);
  }
  panel.appendChild(list);
  // Fixed overlay on body — not inside scrollable chat (that hid history)
  document.body.appendChild(panel);
  panel.querySelector('#hist-close')?.addEventListener('click', () => panel.remove());
  panel.addEventListener('click', (e) => {
    if (e.target === panel) panel.remove();
  });
  // Esc to close
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
  for (const s of sessions.slice(0, 6)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mimo-session-card';
    btn.innerHTML = `<div class="mimo-session-title">${escHtml(s.title)}</div><div class="mimo-session-id">${escHtml(s.id)}</div>`;
    btn.addEventListener('click', () => {
      showLoading(s.title);
      post({ type: 'selectSession', sessionId: s.id });
    });
    list.appendChild(btn);
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
  listWrap.querySelector('#btn-history')?.addEventListener('click', () => post({ type: 'fetchSessions', history: true }));
}

function showLoading(title: string): void {
  titleEl.textContent = title || 'Loading…';
  let ov = document.getElementById('session-load-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'session-load-overlay';
    ov.className = 'session-load-overlay';
    ov.innerHTML =
      '<div class="session-load-overlay-text">Loading session…</div><div class="session-load-overlay-sub">DB-first tail</div>';
    chat.appendChild(ov);
  }
}

function hideLoading(): void {
  document.getElementById('session-load-overlay')?.remove();
}

function setInputEnabled(on: boolean): void {
  if (promptEl) promptEl.disabled = !on || busy;
  if (btnSend) btnSend.disabled = !on || busy;
}

function setBusy(on: boolean): void {
  busy = on;
  setInputEnabled(true);
  if (btnAbort) btnAbort.hidden = !on;
  if (statusLabel) statusLabel.textContent = on ? 'running…' : 'v2';
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
  if (cmd === 'new') {
    post({ type: 'newSession' });
    return true;
  }
  if (cmd === 'clear') {
    chat.innerHTML = '';
    return true;
  }
  if (cmd === 'sessions' || cmd === 'history') {
    post({ type: 'fetchSessions', history: true });
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
      post({ type: 'sendPrompt', text: rest, sessionId: activeSessionId || undefined, mode: cmd, model: selectedModel || undefined });
    }
    return true;
  }
  if (cmd === 'help') {
    appendOrUpdateMessage({
      id: 'sys_help_' + Date.now(),
      role: 'assistant',
      text: 'Slash: /new /clear /sessions /history /stop /plan /build /help — and skills like /arxiv, /deep-research (sent to agent).',
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
  promptEl.value = '';
  post({
    type: 'sendPrompt',
    text,
    sessionId: activeSessionId || undefined,
    mode: selectedMode,
    model: selectedModel || undefined,
  });
}

function onScroll(): void {
  autoScroll = isNearBottom(chat);
  if (!activeSessionId) return;
  const older = Number((window as any).__mimoOlderCount || 0);
  const exhausted = (window as any).__mimoLoadMoreExhausted === true;
  // Trigger near top — allow even when olderCount was 0 once (host may still have more)
  const nearTop = chat.scrollTop < 280;
  if (nearTop && !loadMoreInFlight && !exhausted) {
    // Always try if we have a session and aren't exhausted; host returns olderCount
    if (older <= 0 && loadedCount < 20) return;
    const now = Date.now();
    if (now - loadMoreCooldown < 500) return;
    loadMoreCooldown = now;
    loadMoreInFlight = true;
    updateHistoryTopSpacer(chat, Math.max(older, 1), true);
    post({
      type: 'loadMoreSession',
      sessionId: activeSessionId,
      count: Math.max(loadedCount, 24) + 40,
    });
  }
}

chat.addEventListener('scroll', onScroll, { passive: true });
btnHome?.addEventListener('click', () => {
  // Home = logo + recent sessions, NOT a blank new session
  activeSessionId = '';
  titleEl.textContent = 'MiMo Code';
  document.getElementById('mimo-history-panel')?.remove();
  post({ type: 'goHome' });
});
btnHistoryTop?.addEventListener('click', () => post({ type: 'fetchSessions', history: true }));
btnSend?.addEventListener('click', doSend);
btnAbort?.addEventListener('click', () => post({ type: 'abort' }));
promptEl?.addEventListener('input', onPromptInput);
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
      if (message.metadataOnly && activeSessionId) break;
      // Home / goHome always forces startup (logo + recent), even if a session was open
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
      break;
    case 'streamDone':
      setBusy(false);
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
      }
      if (message.loading === false && message.error) {
        loadMoreInFlight = false;
        (window as any).__mimoLoadMoreExhausted = true;
      }
      break;
    case 'sessionLoadFailed':
      hideLoading();
      loadMoreInFlight = false;
      chat.innerHTML = `<div class="error">Failed: ${escHtml(message.error || 'unknown')}</div>`;
      break;
    case 'error':
      setBusy(false);
      if (statusLabel) statusLabel.textContent = String(message.error || 'error').slice(0, 40);
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
    case 'serverStatus':
      if (statusLabel)
        statusLabel.textContent = `${message.status || ''}${message.detail ? ' ' + message.detail : ''}`.slice(
          0,
          48
        );
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
  const items = (slashCatalog || [])
    .filter((c) => !q || c.name.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q))
    .slice(0, 24);
  if (!items.length) {
    el.hidden = true;
    return;
  }
  if (slashIndex >= items.length) slashIndex = 0;
  el.innerHTML = items
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
        <button type="button" data-r="once">Allow once</button>
        <button type="button" data-r="always">Allow always</button>
        <button type="button" data-r="reject" class="danger">Reject</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  ov.querySelectorAll('button[data-r]').forEach((b) => {
    b.addEventListener('click', () => {
      post({
        type: 'permissionReply',
        sessionId: req.sessionId || activeSessionId,
        permissionId: req.permissionId,
        response: (b as HTMLElement).dataset.r,
      });
      ov.remove();
    });
  });
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
    const flat = answers.map((a) => (a.length ? a[0] : '')).filter(Boolean);
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

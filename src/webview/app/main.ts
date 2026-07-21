/**
 * Webview entry (bundled to media/app.js).
 */
import { splitMimoParts } from '../../host/format/mimoPart';
import { collapseMessagesForDisplay } from '../../host/session/merge';
import { paintLogo } from '../logo/logoEngine';
import { startStarfield } from '../logo/starfield';
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
    det.innerHTML = `<summary><span class="mimo-thinking-title">thinking</span>${
      (seg as any).duration
        ? `<span class="mimo-dur">${escHtml((seg as any).duration)}</span>`
        : ''
    }</summary><div class="mimo-thinking-body">${escHtml((seg as any).body)}</div>`;
    return det;
  }
  const det = document.createElement('details');
  det.className = 'mimo-part';
  det.open = Boolean((seg as any).open);
  const title = escHtml((seg as any).title || seg.kind);
  const meta = escHtml((seg as any).meta || '');
  const body = String((seg as any).body || '');
  const { inn, out } = parseInOut(body);
  let bodyHtml = '';
  if (inn)
    bodyHtml += `<div class="mimo-io"><div class="mimo-io-k">IN</div><pre class="mimo-io-v">${escHtml(inn)}</pre></div>`;
  if (out) {
    const isDiff = looksLikeDiff(out);
    bodyHtml += `<div class="mimo-io"><div class="mimo-io-k">OUT</div><pre class="mimo-io-v${
      isDiff ? ' mimo-io-v--diff' : ''
    }">${isDiff ? colorDiff(out) : escHtml(out)}</pre></div>`;
  }
  det.innerHTML = `<summary><span class="mimo-part-title">${title}</span>${
    meta ? `<span class="mimo-part-meta">${meta}</span>` : ''
  }</summary><div class="mimo-part-body">${bodyHtml}</div>`;
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
  return /^(diff |Index: |@@ |\+|\-|--- |\+\+\+)/m.test(t) || /```diff/.test(t);
}

function colorDiff(t: string): string {
  return t
    .split('\n')
    .map((line) => {
      const e = escHtml(line);
      if (line.startsWith('+') && !line.startsWith('+++'))
        return `<span class="mimo-diff-add">${e}</span>`;
      if (line.startsWith('-') && !line.startsWith('---'))
        return `<span class="mimo-diff-del">${e}</span>`;
      if (line.startsWith('@@')) return `<span class="mimo-diff-hunk">${e}</span>`;
      return e;
    })
    .join('\n');
}

function formatMarkdownLite(text: string): string {
  const lines = String(text || '').split(/\n/);
  const blocks: string[] = [];
  let buf: string[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  const flush = () => {
    if (!buf.length) return;
    blocks.push(`<p>${inlineMd(buf.join('\n'))}</p>`);
    buf = [];
  };
  for (const line of lines) {
    if (/^```/.test(line)) {
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

function showStartup(sessions: Array<{ id: string; title: string; updated?: string }>): void {
  activeSessionId = '';
  titleEl.textContent = 'MiMo Code';
  setInputEnabled(true);
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
    <button type="button" id="btn-refresh">Refresh</button>
    <button type="button" id="btn-new" class="primary">New session</button>`;
  listWrap.appendChild(actions);

  root.appendChild(listWrap);
  chat.appendChild(root);
  paintLogo(logoHost);
  listWrap.querySelector('#btn-refresh')?.addEventListener('click', () =>
    post({ type: 'fetchSessions' })
  );
  listWrap.querySelector('#btn-new')?.addEventListener('click', () => post({ type: 'newSession' }));
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

function doSend(): void {
  const text = (promptEl?.value || '').trim();
  if (!text || busy) return;
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
  if (chat.scrollTop < 120 && !loadMoreInFlight) {
    const now = Date.now();
    if (now - loadMoreCooldown < 800) return;
    loadMoreCooldown = now;
    loadMoreInFlight = true;
    updateHistoryTopSpacer(chat, (window as any).__mimoOlderCount || 0, true);
    post({
      type: 'loadMoreSession',
      sessionId: activeSessionId,
      count: loadedCount + 40,
    });
  }
}

chat.addEventListener('scroll', onScroll, { passive: true });
btnHome?.addEventListener('click', () => post({ type: 'newSession' }));
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
      if (message.showStartupChooser !== false && !activeSessionId) {
        showStartup(Array.isArray(message.sessions) ? message.sessions : []);
      }
      break;
    }
    case 'sessionsList':
      if (!activeSessionId)
        showStartup(Array.isArray(message.sessions) ? message.sessions : []);
      break;
    case 'sessionData': {
      hideLoading();
      const sid = message.sessionId as string;
      activeSessionId = sid;
      titleEl.textContent = message.title || sid;
      document.getElementById('mimo-startup')?.remove();
      const meta = message.meta || {};
      (window as any).__mimoOlderCount = meta.olderCount || 0;
      renderMessages(message.messages || [], {
        loadMore: meta.loadMore === true || meta.source === 'loadMore',
        olderCount: meta.olderCount || 0,
        pinBottom: meta.pinBottom !== false && meta.source !== 'loadMore',
      });
      if (meta.loadMore) loadMoreInFlight = false;
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
        updateHistoryTopSpacer(chat, message.olderCount, message.loading === true);
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
    case 'serverStatus':
      if (statusLabel)
        statusLabel.textContent = `${message.status || ''}${message.detail ? ' ' + message.detail : ''}`.slice(
          0,
          48
        );
      break;
  }
});

startStarfield(document.getElementById('starfield') as HTMLCanvasElement | null);

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
post({ type: 'ready' });

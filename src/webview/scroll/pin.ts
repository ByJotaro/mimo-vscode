export function isNearBottom(el: HTMLElement, px = 80): boolean {
  return el.scrollHeight - (el.scrollTop + el.clientHeight) < px;
}

export function scrollToBottom(el: HTMLElement, force = true): void {
  if (!force && !isNearBottom(el)) return;
  el.scrollTop = el.scrollHeight;
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight;
  });
}

export function pinBottomUntilSettled(el: HTMLElement, reason: string): void {
  const times = [0, 16, 50, 120, 250, 500, 900, 1500];
  for (const ms of times) {
    setTimeout(() => {
      scrollToBottom(el, true);
      if (ms >= 900) {
        const tools = el.querySelectorAll('.mimo-part').length;
        const near = isNearBottom(el) ? 1 : 0;
        try {
          (window as any).__mimoVscodeApi?.postMessage?.({
            type: 'ui-debug',
            payload: [`[WV][SCROLL_FINAL]`, `near=${near}`, `tools=${tools}`, reason],
          });
        } catch {
          /* */
        }
      }
    }, ms);
  }
}

export function preserveScrollOnPrepend(
  el: HTMLElement,
  prevScrollH: number,
  prevScrollT: number
): void {
  requestAnimationFrame(() => {
    const delta = el.scrollHeight - prevScrollH;
    el.scrollTop = prevScrollT + Math.max(0, delta);
  });
}

export function updateHistoryTopSpacer(
  chat: HTMLElement,
  olderCount: number,
  loading: boolean
): void {
  let sp = document.getElementById('mimo-history-spacer');
  const n = Math.max(0, Number(olderCount) || 0);
  if (n <= 0 && !loading) {
    sp?.remove();
    return;
  }
  if (!sp) {
    sp = document.createElement('div');
    sp.id = 'mimo-history-spacer';
    sp.className = 'mimo-history-spacer';
    sp.setAttribute('aria-hidden', 'true');
    chat.insertBefore(sp, chat.firstChild);
  }
  // Compact load-zone only — NOT virtual height of all older msgs (that looked like empty void)
  const h = loading ? 56 : Math.min(72, Math.max(40, 36 + Math.min(n, 8) * 2));
  sp.style.height = h + 'px';
  sp.style.minHeight = h + 'px';
  sp.classList.toggle('is-loading', loading);
  sp.innerHTML = loading
    ? '<div class="mimo-history-spacer-label">Loading older messages…</div>'
    : n > 0
      ? `<div class="mimo-history-spacer-label">↑ ${n} older · scroll to load</div>`
      : '';
}

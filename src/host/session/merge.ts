import type { DisplayMessage } from '../format/formatPart';

/** Prefer tool-rich text over plain snapshot when same id. */
export function textScore(t: string): number {
  if (!t) return 0;
  let s = t.length;
  if (t.includes('%%MIMO_PART')) s += 1_000_000;
  if (t.includes('%%MIMO_PART:tool') || t.includes('%%MIMO_PART:patch')) s += 500_000;
  if (t.includes('%%MIMO_PART:thinking')) s += 100_000;
  return s;
}

export function mergeSessionMessagesById(
  baseMessages: DisplayMessage[],
  incomingMessages: DisplayMessage[]
): DisplayMessage[] {
  const merged: DisplayMessage[] = Array.isArray(baseMessages) ? [...baseMessages] : [];
  const indexById = new Map<string, number>();
  for (let i = 0; i < merged.length; i++) {
    if (merged[i]?.id) indexById.set(merged[i].id, i);
  }
  if (!Array.isArray(incomingMessages)) return merged;

  for (const message of incomingMessages) {
    if (!message || typeof message.text !== 'string') continue;
    const messageId = message.id || '';
    if (messageId && indexById.has(messageId)) {
      const idx = indexById.get(messageId)!;
      const prev = merged[idx];
      const prevText = prev.text || '';
      const nextText = message.text || '';
      const preferNext = textScore(nextText) > textScore(prevText);
      merged[idx] = {
        ...prev,
        ...message,
        id: messageId,
        role: message.role || prev.role,
        text: preferNext ? nextText : prevText || nextText,
      };
      continue;
    }
    if (messageId) indexById.set(messageId, merged.length);
    merged.push(message);
  }
  return merged;
}

/** Keep EVERY assistant — never collapse to last-only (v1 bug). */
export function collapseMessagesForDisplay(
  messages: DisplayMessage[]
): DisplayMessage[] {
  if (!Array.isArray(messages) || !messages.length) return [];
  const out: DisplayMessage[] = [];
  for (const item of messages) {
    if (!item?.id) continue;
    if (item.role === 'system') {
      if ((item.meta as any)?.kind === 'changeList') out.push(item);
      continue;
    }
    if (item.role === 'user') {
      const text = String(item.text || '').replace(/^(\r?\n)+/, '');
      if (!text.trim()) continue;
      out.push({ ...item, text });
      continue;
    }
    if (item.role === 'assistant') {
      if (!String(item.text || '').trim()) continue;
      out.push(item);
    }
  }
  return out;
}

/**
 * %%MIMO_PART protocol — shared host encoding rules.
 * Header fields must NEVER contain | or % (webview splits on |).
 */

export type MimoPartKind = 'tool' | 'patch' | 'thinking' | 'file' | string;

export function sanitizeHeaderField(s: string, max = 160): string {
  return String(s || '')
    .replace(/\|/g, '/')
    .replace(/%/g, 'pct')
    .replace(/\r?\n/g, ' ')
    .replace(/%%/g, '')
    .slice(0, max);
}

export function wrapMimoPart(
  kind: MimoPartKind,
  title: string,
  meta: string,
  body: string,
  open = false,
  duration = ''
): string {
  const flag = open ? 'open' : 'closed';
  const safeBody = String(body || '').replace(/%%\/MIMO_PART%%/g, '%%/MIMO_PART_ESC%%');
  return (
    `\n%%MIMO_PART:${sanitizeHeaderField(kind)}|${sanitizeHeaderField(title)}|` +
    `${sanitizeHeaderField(meta)}|${flag}|${sanitizeHeaderField(duration)}%%\n` +
    `${safeBody}\n%%/MIMO_PART%%\n`
  );
}

/** Webview-compatible splitter (also used in tests). */
export type SplitSeg =
  | { kind: 'text'; body: string }
  | {
      kind: string;
      title: string;
      meta: string;
      open: boolean;
      duration: string;
      body: string;
    };

export function splitMimoParts(text: string): SplitSeg[] {
  const src = String(text || '');
  const out: SplitSeg[] = [];
  const re =
    /%%MIMO_PART:([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|(.*?)%%\r?\n?([\s\S]*?)%%\/MIMO_PART%%/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let found = false;
  while ((m = re.exec(src)) !== null) {
    found = true;
    if (m.index > last) out.push({ kind: 'text', body: src.slice(last, m.index) });
    const openFlag = (m[4] || '').trim();
    const body = String(m[6] || '').replace(/%%\/MIMO_PART_ESC%%/g, '%%/MIMO_PART%%');
    out.push({
      kind: (m[1] || 'tool').trim() || 'tool',
      title: (m[2] || '').trim(),
      meta: (m[3] || '').trim(),
      open: openFlag === 'open',
      duration: (m[5] || '').trim(),
      body,
    });
    last = m.index + m[0].length;
  }
  if (found) {
    if (last < src.length) out.push({ kind: 'text', body: src.slice(last) });
    return out;
  }
  return [{ kind: 'text', body: src }];
}

export function countMimoCards(text: string): number {
  return splitMimoParts(text).filter((s) => s.kind !== 'text').length;
}

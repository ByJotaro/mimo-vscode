// Gate: MIMO_PART split must survive % in meta and not drop tool cards
const re = /%%MIMO_PART:([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|(.*?)%%\r?\n?([\s\S]*?)%%\/MIMO_PART%%/g;

function splitMimoParts(text) {
  const src = String(text || '');
  const out = [];
  let last = 0;
  let m;
  let found = false;
  re.lastIndex = 0;
  while ((m = re.exec(src)) !== null) {
    found = true;
    if (m.index > last) out.push({ kind: 'text', body: src.slice(last, m.index) });
    out.push({
      kind: (m[1] || 'tool').trim() || 'tool',
      title: (m[2] || '').trim(),
      meta: (m[3] || '').trim(),
      open: (m[4] || '').trim() === 'open',
      duration: (m[5] || '').trim(),
      body: String(m[6] || '').replace(/%%\/MIMO_PART_ESC%%/g, '%%/MIMO_PART%%'),
    });
    last = m.index + m[0].length;
  }
  if (found) {
    if (last < src.length) out.push({ kind: 'text', body: src.slice(last) });
    return out;
  }
  return [{ kind: 'text', body: src }];
}

function wrap(kind, title, meta, body, open = false) {
  const safe = (s) => String(s || '').replace(/\|/g, '/').replace(/%/g, 'pct').replace(/\r?\n/g, ' ').slice(0, 160);
  const safeBody = String(body || '').replace(/%%\/MIMO_PART%%/g, '%%/MIMO_PART_ESC%%');
  return `\n%%MIMO_PART:${safe(kind)}|${safe(title)}|${safe(meta)}|${open ? 'open' : 'closed'}|%%\n${safeBody}\n%%/MIMO_PART%%\n`;
}

let fail = 0;
function ok(name, cond) {
  console.log((cond ? 'OK' : 'FAIL') + '  ' + name);
  if (!cond) fail++;
}

const multi =
  wrap('thinking', 'thinking', '', 'hmm') +
  wrap('tool', 'bash', '100% path|weird', 'IN:\necho hi\nOUT:\nok') +
  wrap('patch', 'edit', 'file.js', 'IN:\nf.js\nOUT:\n--- a\n+++ b\n-a\n+b', true) +
  ' trailing text';

const parts = splitMimoParts(multi);
const kinds = parts.filter((p) => p.kind !== 'text').map((p) => p.kind + ':' + p.title);
ok('parses 3 tool cards', kinds.length === 3);
ok('thinking present', kinds.includes('thinking:thinking'));
ok('bash present', kinds.includes('tool:bash'));
ok('edit present', kinds.includes('patch:edit'));
ok('meta pct sanitized', parts.some((p) => p.kind === 'tool' && p.meta.includes('pct')));
ok('edit open', parts.some((p) => p.kind === 'patch' && p.open === true));
ok('bash body has OUT', parts.some((p) => p.kind === 'tool' && /OUT:/.test(p.body)));
ok('poison close restored', (() => {
  const s = wrap('tool', 'bash', 'x', 'IN:\n%%/MIMO_PART%%\nOUT:\ny');
  const p = splitMimoParts(s).find((x) => x.kind === 'tool');
  return p && p.body.includes('%%/MIMO_PART%%') && p.body.includes('OUT:');
})());
// Old broken regex would fail on %
const oldRe = /%%MIMO_PART:([^|%]+)\|([^|%]*)\|([^|%]*)\|([^|%]*)\|?([^%]*)%%\n?([\s\S]*?)%%\/MIMO_PART%%/g;
const withPct = '\n%%MIMO_PART:tool|bash|100% done|closed|%%\nIN:\nx\n%%/MIMO_PART%%\n';
ok('old regex fails on % (regression baseline)', !oldRe.exec(withPct));
oldRe.lastIndex = 0;
ok('new regex accepts pct-safe meta', (() => {
  const s = wrap('tool', 'bash', '100% done', 'IN:\nx');
  return splitMimoParts(s).some((p) => p.kind === 'tool');
})());

console.log(fail ? 'SPLIT_FAIL' : 'SPLIT_PASS');
process.exit(fail ? 1 : 0);

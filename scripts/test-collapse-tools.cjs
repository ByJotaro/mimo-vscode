// Ensure collapseSessionDataMessagesForDisplay keeps ALL assistant tool messages
function isHiddenControlUserText() { return false; }
function isHiddenControlAssistantText() { return false; }
function stripSystemInjections(t) { return t; }

function collapseSessionDataMessagesForDisplay(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  const collapsed = [];
  for (const item of messages) {
    if (!item || !item.id) continue;
    const role = item.role;
    const meta = item.meta || {};
    if (role === 'system') {
      if (meta.kind === 'changeList') collapsed.push(item);
      continue;
    }
    if (role === 'user') {
      const text = stripSystemInjections((item.text || '').replace(/^(\r?\n)+/, ''));
      if (!text.trim()) continue;
      collapsed.push({ ...item, text });
      continue;
    }
    if (role === 'assistant') {
      const text = item.text || '';
      if (!text.trim()) continue;
      collapsed.push({ ...item, text });
    }
  }
  return collapsed;
}

const msgs = [
  { id: 'u1', role: 'user', text: 'hi' },
  { id: 'a1', role: 'assistant', text: '%%MIMO_PART:tool|bash|x|closed|%%\nIN:\necho\n%%/MIMO_PART%%' },
  { id: 'a2', role: 'assistant', text: '%%MIMO_PART:patch|edit|f|open|%%\nIN:\nf\nOUT:\n--- a\n+b\n%%/MIMO_PART%%' },
  { id: 'a3', role: 'assistant', text: 'plain final answer' },
  { id: 'u2', role: 'user', text: 'next' },
  { id: 'a4', role: 'assistant', text: '%%MIMO_PART:tool|read|y|closed|%%\nIN:\ny\n%%/MIMO_PART%%' },
];
const out = collapseSessionDataMessagesForDisplay(msgs);
const assistants = out.filter((m) => m.role === 'assistant');
const tools = assistants.filter((m) => m.text.includes('%%MIMO_PART'));
console.log({ total: out.length, assistants: assistants.length, tools: tools.length });
const ok = assistants.length === 4 && tools.length === 3;
console.log(ok ? 'COLLAPSE_KEEP_TOOLS_OK' : 'COLLAPSE_KEEP_TOOLS_FAIL');
process.exit(ok ? 0 : 1);

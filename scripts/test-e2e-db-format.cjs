const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const exe = path.join(process.env.USERPROFILE, 'AppData/Roaming/npm/node_modules/@mimo-ai/cli/node_modules/@mimo-ai/mimocode-windows-x64/bin/mimo.exe');
function mimoDb(sql) {
  const out = execFileSync(exe, ['db', sql], { encoding: 'utf8', maxBuffer: 80*1024*1024, windowsHide: true, timeout: 90000 });
  const i = out.indexOf('['); const j = out.lastIndexOf(']');
  if (i < 0 || j < i) throw new Error('no json: ' + out.slice(0, 200));
  return JSON.parse(out.substring(i, j+1));
}
const sid = 'ses_0926fd416ffeyXG0Mc5SdUf7G4';
const limit = 40;
const t0 = Date.now();
// same SQL as querySessionFromDb (capped)
const sql = "SELECT json_group_array(json_object(" +
  "'mid', p.message_id, 'role', json_extract(m.data,'$.role'), 'type', json_extract(p.data,'$.type'), " +
  "'text', substr(COALESCE(json_extract(p.data,'$.text'),''),1,12000), " +
  "'tool', json_extract(p.data,'$.tool'), " +
  "'cmd', substr(COALESCE(json_extract(p.data,'$.state.input.command'),''),1,6000), " +
  "'path', json_extract(p.data,'$.state.input.file_path'), " +
  "'old_string', substr(COALESCE(json_extract(p.data,'$.state.input.old_string'),''),1,8000), " +
  "'new_string', substr(COALESCE(json_extract(p.data,'$.state.input.new_string'),''),1,8000), " +
  "'content', substr(COALESCE(json_extract(p.data,'$.state.input.content'),''),1,8000), " +
  "'meta_diff', substr(COALESCE(json_extract(p.data,'$.state.metadata.diff'),''),1,12000), " +
  "'meta_patch', substr(COALESCE(json_extract(p.data,'$.state.metadata.filediff.patch'),''),1,12000), " +
  "'result', substr(COALESCE(json_extract(p.data,'$.state.output'),''),1,8000), " +
  "'callID', json_extract(p.data,'$.callID'), " +
  "'hash', json_extract(p.data,'$.hash'), 'files', json_extract(p.data,'$.files'), " +
  "'time', p.time_created)) " +
  "FROM part p JOIN (SELECT message_id, MAX(time_created) as mt FROM part WHERE session_id = '" + sid + "' GROUP BY message_id ORDER BY mt DESC LIMIT " + limit + ") sm ON p.message_id = sm.message_id " +
  "JOIN message m ON m.id = p.message_id WHERE p.session_id = '" + sid + "' ORDER BY p.time_created;";
const arr = mimoDb(sql);
const byMsg = new Map();
const order = [];
for (const row of arr) {
  if (!byMsg.has(row.mid)) { byMsg.set(row.mid, { id: row.mid, role: row.role, parts: [] }); order.push(row.mid); }
  byMsg.get(row.mid).parts.push(row);
}
const messages = order.map(id => byMsg.get(id));
const dbMs = Date.now() - t0;

// wrap + format like host
function wrap(kind,title,meta,body,open=false){
  const safe=s=>String(s||'').replace(/\|/g,'/').replace(/%/g,'pct').replace(/\r?\n/g,' ').slice(0,160);
  const safeBody=String(body||'').replace(/%%\/MIMO_PART%%/g,'%%/MIMO_PART_ESC%%');
  return `\n%%MIMO_PART:${safe(kind)}|${safe(title)}|${safe(meta)}|${open?'open':'closed'}|%%\n${safeBody}\n%%/MIMO_PART%%\n`;
}
function formatPart(p){
  const type = p.type || '';
  if (type === 'step-start' || type === 'step-finish' || type === 'compaction') return '';
  if (type === 'text' && p.text) return String(p.text);
  if (type === 'reasoning' || type === 'thinking') {
    if (!p.text) return '';
    return wrap('thinking','thinking','',p.text);
  }
  if (type === 'tool' || type === 'tool_use') {
    const tool = String(p.tool || 'tool');
    let cmd = p.cmd || '';
    if (cmd && cmd.includes('\\n') && !cmd.includes('\n')) cmd = cmd.replace(/\\n/g,'\n');
    if (cmd.length > 8000) cmd = cmd.slice(0,8000)+'\n…';
    const path = p.path || '';
    const oldStr = p.old_string || '';
    const newStr = p.new_string || '';
    const metaDiff = p.meta_diff || '';
    const isEdit = /^(edit|str_replace|multiedit)/i.test(tool);
    const isWrite = /^(write|edit)/i.test(tool);
    let body = '';
    if (cmd) body += `IN:\n${cmd}\n`;
    else if (path) body += `IN:\n${path}\n`;
    let outText = '';
    if ((isEdit||isWrite) && metaDiff) outText = metaDiff;
    else if (isEdit && (oldStr||newStr)) {
      outText = `--- a/${path||'f'}\n+++ b/${path||'f'}\n` + (oldStr?oldStr.split('\n').map(l=>'-'+l).join('\n')+'\n':'') + (newStr?newStr.split('\n').map(l=>'+'+l).join('\n'):'');
    } else if (p.content) outText = p.content;
    else if (p.result) outText = p.result;
    else outText = 'ok';
    if (outText.length > 16000) outText = outText.slice(0,16000)+'\n…';
    body += `OUT:\n${outText}`;
    const title = isEdit ? 'edit' : tool;
    const meta = path ? path.replace(/\\/g,'/').split('/').pop() : (cmd?cmd.split('\n')[0].slice(0,60):'');
    return wrap(isEdit?'patch':'tool', title, meta, body, false);
  }
  return '';
}
let toolMsgs=0, thinkingMsgs=0, totalParts=0, toolParts=0;
const formatted = [];
for (const msg of messages) {
  let full='';
  for (const p of (msg.parts||[])) {
    totalParts++;
    if (p.type==='tool') toolParts++;
    full += formatPart(p);
  }
  if (!full.trim()) continue;
  if (full.includes('%%MIMO_PART:tool') || full.includes('%%MIMO_PART:patch')) toolMsgs++;
  if (full.includes('%%MIMO_PART:thinking')) thinkingMsgs++;
  formatted.push({ id: msg.id, role: msg.role, text: full });
}
// split test
const re=/%%MIMO_PART:([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|(.*?)%%\r?\n?([\s\S]*?)%%\/MIMO_PART%%/g;
let cards=0;
for (const m of formatted) {
  re.lastIndex=0; let mm;
  while ((mm=re.exec(m.text))) cards++;
}
console.log(JSON.stringify({
  dbMs, messages: messages.length, formatted: formatted.length,
  toolParts, toolMsgs, thinkingMsgs, splitCards: cards,
  sampleHasMimo: formatted.some(m => m.text.includes('%%MIMO_PART')),
}, null, 2));
const ok = cards > 0 && toolMsgs > 0 && dbMs < 30000;
console.log(ok ? 'E2E_DB_FORMAT_OK' : 'E2E_DB_FORMAT_FAIL');
process.exit(ok ? 0 : 1);

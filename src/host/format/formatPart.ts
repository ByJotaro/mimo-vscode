import { wrapMimoPart } from './mimoPart';

export function formatPartDuration(part: any): string {
  const num = (v: any): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  const start =
    num(part?.time?.start) ??
    num(part?.time?.created) ??
    num(part?.start) ??
    num(part?.timeStart);
  const end =
    num(part?.time?.end) ??
    num(part?.time?.completed) ??
    num(part?.end) ??
    num(part?.timeEnd);
  let ms = num(part?.duration) ?? num(part?.durationMs) ?? num(part?.ms);
  if (ms === undefined && start !== undefined && end !== undefined && end >= start) {
    ms = end - start;
    if (ms > 0 && ms < 1000 && end < 1e12) ms = ms * 1000;
  }
  if (ms === undefined || ms < 0) return '';
  if (ms < 1000) return `${Math.max(1, Math.round(ms))}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

/** Format one DB/API part into display text (often a MIMO_PART card). */
export function formatPartForDisplay(part: any): string {
  if (!part || typeof part !== 'object') return '';
  const type = typeof part.type === 'string' ? part.type : '';
  if (type === 'step-start' || type === 'step-finish' || type === 'compaction') return '';
  const duration = formatPartDuration(part);

  if (type === 'patch') {
    const files = Array.isArray(part.files)
      ? part.files.map((f: any) => String(f)).filter(Boolean)
      : [];
    const fullPaths = files.length
      ? files.map((f: string) => String(f))
      : typeof part.path === 'string'
        ? [part.path]
        : [];
    const fileLabel =
      fullPaths
        .map((f: string) => {
          const norm = f.replace(/\\/g, '/');
          return norm.includes('/') ? norm.slice(norm.lastIndexOf('/') + 1) : norm;
        })
        .join(', ') || (part.hash ? String(part.hash).slice(0, 12) : 'edit');
    const body =
      typeof part.text === 'string' && part.text.trim()
        ? part.text
        : typeof part.diff === 'string'
          ? part.diff
          : typeof part.patch === 'string'
            ? part.patch
            : '';
    let content = '';
    if (fullPaths.length) content += `IN:\n${fullPaths.join('\n')}\n`;
    if (body.trim()) content += `OUT:\n${body}`;
    else if (part.hash) content += `OUT:\nfile edit · ${String(part.hash).slice(0, 12)}`;
    else content += `OUT:\n${fileLabel}`;
    return wrapMimoPart('patch', 'edit', fileLabel, content, false, duration);
  }

  if (type === 'tool' || type === 'tool_use') {
    const toolName = String(part.tool || part.name || 'tool');
    const input =
      part.state && typeof part.state.input === 'object' && part.state.input
        ? part.state.input
        : part.input && typeof part.input === 'object'
          ? part.input
          : {};
    const pick = (...keys: string[]): string => {
      for (const k of keys) {
        const v = (input as any)?.[k] ?? (part as any)?.[k];
        if (typeof v === 'string' && v.trim()) return v;
      }
      return '';
    };
    let cmd = pick('command', 'cmd');
    if (cmd && cmd.includes('\\n') && !cmd.includes('\n')) {
      cmd = cmd.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    }
    if (cmd && cmd.length > 8000) cmd = cmd.slice(0, 8000) + '\n…';
    const path = pick('file_path', 'filePath', 'path', 'file', 'filename', 'target', 'uri');
    const contentIn = pick('content', 'text', 'contents');
    const oldStr = pick('old_string', 'oldString', 'old_str', 'before');
    const newStr = pick('new_string', 'newString', 'new_str', 'after');
    const status = part.state?.status || part.status || '';
    const result =
      part.result || part.state?.output || part.output || part.state?.metadata?.output || '';
    const metaObj =
      part.state && typeof part.state.metadata === 'object' && part.state.metadata
        ? part.state.metadata
        : part.metadata && typeof part.metadata === 'object'
          ? part.metadata
          : {};
    const metaDiff =
      typeof (metaObj as any)?.diff === 'string' ? String((metaObj as any).diff) : '';
    const metaPatch =
      typeof (metaObj as any)?.filediff?.patch === 'string'
        ? String((metaObj as any).filediff.patch)
        : typeof (metaObj as any)?.patch === 'string'
          ? String((metaObj as any).patch)
          : '';
    const isWrite = /^(write|edit|apply_patch|str_replace|create_file|notebook|multiedit)/i.test(
      toolName
    );
    const isEdit = /^(edit|str_replace|multiedit)/i.test(toolName);
    let body = '';
    if (cmd) body += `IN:\n${cmd}\n`;
    else if (path) body += `IN:\n${path}\n`;
    let outText = '';
    if ((isEdit || isWrite) && (metaDiff.trim() || metaPatch.trim())) {
      outText = metaDiff.trim() || metaPatch.trim();
    } else if (isEdit && (oldStr || newStr)) {
      const oldLines = oldStr ? oldStr.split('\n') : [];
      const newLines = newStr ? newStr.split('\n') : [];
      const maxShow = 120;
      const lines: string[] = [`--- a/${path || 'file'}`, `+++ b/${path || 'file'}`];
      for (let i = 0; i < Math.min(oldLines.length, maxShow); i++) lines.push('-' + oldLines[i]);
      if (oldLines.length > maxShow) lines.push(`-… (${oldLines.length - maxShow} more lines)`);
      for (let i = 0; i < Math.min(newLines.length, maxShow); i++) lines.push('+' + newLines[i]);
      if (newLines.length > maxShow) lines.push(`+… (${newLines.length - maxShow} more lines)`);
      outText = lines.join('\n');
    } else if (isWrite && contentIn) {
      outText =
        contentIn.length > 12000
          ? contentIn.slice(0, 12000) + `\n… (${contentIn.length} chars total)`
          : contentIn;
    } else if (typeof result === 'string' && result.trim()) {
      outText = result;
    } else if (typeof part.text === 'string' && part.text.trim() && !cmd && !path) {
      outText = part.text;
    }
    if (typeof outText === 'string' && outText.length > 16000) {
      outText = outText.slice(0, 16000) + '\n…';
    }
    if (outText) {
      body += `OUT:\n${outText}`;
    } else {
      const fallback =
        status && status !== 'completed'
          ? status
          : isWrite || isEdit
            ? 'ok'
            : status || toolName;
      if (!body) {
        body = path ? `IN:\n${path}\nOUT:\n${fallback}` : `OUT:\n${fallback}`;
      } else if (!/^OUT:/m.test(body)) {
        body += `OUT:\n${fallback}`;
      }
    }
    const open = status === 'running' || status === 'pending';
    const baseName = path
      ? String(path).replace(/\\/g, '/').split('/').pop() || String(path)
      : '';
    const isBashTool = /^(bash|shell|cmd|powershell|pwsh)$/i.test(toolName);
    const bashHint =
      isBashTool && cmd ? cmd.split('\n')[0].replace(/\s+/g, ' ').slice(0, 88) : '';
    const meta =
      baseName || bashHint || (status && status !== 'completed' ? String(status) : '');
    const title = isEdit
      ? 'edit'
      : isWrite && /^write$/i.test(toolName)
        ? 'write'
        : toolName;
    const hasMetaDiff = Boolean(metaDiff.trim() || metaPatch.trim());
    const hasDiffBody =
      typeof outText === 'string' &&
      (hasMetaDiff ||
        outText.includes('\n+') ||
        outText.includes('\n-') ||
        /^\+/.test(outText) ||
        /^-/.test(outText) ||
        outText.startsWith('---') ||
        outText.startsWith('Index:') ||
        outText.startsWith('diff ') ||
        outText.includes('\n@@'));
    const openCard =
      open || ((isEdit || isWrite) && !isBashTool && (hasMetaDiff || hasDiffBody));
    return wrapMimoPart(isEdit ? 'patch' : 'tool', title, meta, body, openCard, duration);
  }

  if (type === 'tool_result') {
    const body = typeof part.text === 'string' ? part.text : '';
    return wrapMimoPart('tool', 'result', '', body ? `OUT:\n${body}` : '', false, duration);
  }
  if (type === 'reasoning' || type === 'thinking') {
    const body = typeof part.text === 'string' ? part.text : '';
    if (!body.trim()) return '';
    return wrapMimoPart('thinking', 'thinking', '', body, false, duration);
  }
  if (type === 'file') {
    const p = part.path || part.text || '';
    return wrapMimoPart('file', 'file', String(p), p ? `IN:\n${p}` : '', false, duration);
  }
  if (type === 'text' || type === 'system' || !type) {
    return typeof part.text === 'string' ? part.text : '';
  }
  if (typeof part.text === 'string' && part.text.trim()) {
    return wrapMimoPart('tool', type, '', `OUT:\n${part.text}`, false, duration);
  }
  return '';
}

export type DbMessageRow = {
  id: string;
  role?: string;
  parts?: any[];
  time?: number;
  info?: { id?: string; role?: string };
};

export type DisplayMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  time?: { created: number };
  meta?: Record<string, unknown>;
};

/** Convert DB-grouped messages into webview DisplayMessage[] with MIMO_PART cards. */
export function formatDbMessages(dbRows: DbMessageRow[]): DisplayMessage[] {
  const result: DisplayMessage[] = [];
  for (const msg of dbRows) {
    const parts = Array.isArray(msg.parts) ? msg.parts : [];
    let fullText = '';
    for (const p of parts) {
      if (!p.state) p.state = {};
      if (!p.state.input) p.state.input = {};
      if (!p.state.metadata) p.state.metadata = {};
      if (p.path && !p.state.input.file_path) p.state.input.file_path = p.path;
      if (p.old_string && !p.state.input.old_string) p.state.input.old_string = p.old_string;
      if (p.new_string && !p.state.input.new_string) p.state.input.new_string = p.new_string;
      if (p.content && !p.state.input.content) p.state.input.content = p.content;
      if (p.cmd && !p.state.input.command) p.state.input.command = p.cmd;
      if (p.result && !p.state.output) p.state.output = p.result;
      if (p.meta_diff && !p.state.metadata.diff) p.state.metadata.diff = p.meta_diff;
      if (p.meta_patch) {
        if (!p.state.metadata.filediff) p.state.metadata.filediff = {};
        if (!p.state.metadata.filediff.patch) p.state.metadata.filediff.patch = p.meta_patch;
      }
      fullText += formatPartForDisplay(p);
    }
    if (!fullText.trim()) continue;
    const role = (msg.role || msg.info?.role || 'assistant') as DisplayMessage['role'];
    if (role !== 'user' && role !== 'assistant') continue;
    result.push({
      id: msg.id || msg.info?.id || '',
      role,
      text: fullText,
      time: msg.time ? { created: msg.time } : undefined,
    });
  }
  return result;
}

export function countToolMessages(messages: DisplayMessage[]): number {
  return messages.filter(
    (m) =>
      typeof m.text === 'string' &&
      (m.text.includes('%%MIMO_PART:tool') || m.text.includes('%%MIMO_PART:patch'))
  ).length;
}

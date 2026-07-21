"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/host/format/index.ts
var format_exports = {};
__export(format_exports, {
  countMimoCards: () => countMimoCards,
  countToolMessages: () => countToolMessages,
  formatDbMessages: () => formatDbMessages,
  formatPartDuration: () => formatPartDuration,
  formatPartForDisplay: () => formatPartForDisplay,
  sanitizeHeaderField: () => sanitizeHeaderField,
  splitMimoParts: () => splitMimoParts,
  wrapMimoPart: () => wrapMimoPart
});
module.exports = __toCommonJS(format_exports);

// src/host/format/mimoPart.ts
function sanitizeHeaderField(s, max = 160) {
  return String(s || "").replace(/\|/g, "/").replace(/%/g, "pct").replace(/\r?\n/g, " ").replace(/%%/g, "").slice(0, max);
}
function wrapMimoPart(kind, title, meta, body, open = false, duration = "") {
  const flag = open ? "open" : "closed";
  const safeBody = String(body || "").replace(/%%\/MIMO_PART%%/g, "%%/MIMO_PART_ESC%%");
  return `
%%MIMO_PART:${sanitizeHeaderField(kind)}|${sanitizeHeaderField(title)}|${sanitizeHeaderField(meta)}|${flag}|${sanitizeHeaderField(duration)}%%
${safeBody}
%%/MIMO_PART%%
`;
}
function splitMimoParts(text) {
  const src = String(text || "");
  const out = [];
  const re = /%%MIMO_PART:([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|(.*?)%%\r?\n?([\s\S]*?)%%\/MIMO_PART%%/g;
  let last = 0;
  let m;
  let found = false;
  while ((m = re.exec(src)) !== null) {
    found = true;
    if (m.index > last) out.push({ kind: "text", body: src.slice(last, m.index) });
    const openFlag = (m[4] || "").trim();
    const body = String(m[6] || "").replace(/%%\/MIMO_PART_ESC%%/g, "%%/MIMO_PART%%");
    out.push({
      kind: (m[1] || "tool").trim() || "tool",
      title: (m[2] || "").trim(),
      meta: (m[3] || "").trim(),
      open: openFlag === "open",
      duration: (m[5] || "").trim(),
      body
    });
    last = m.index + m[0].length;
  }
  if (found) {
    if (last < src.length) out.push({ kind: "text", body: src.slice(last) });
    return out;
  }
  return [{ kind: "text", body: src }];
}
function countMimoCards(text) {
  return splitMimoParts(text).filter((s) => s.kind !== "text").length;
}

// src/host/format/formatPart.ts
function formatPartDuration(part) {
  const num = (v) => typeof v === "number" && Number.isFinite(v) ? v : void 0;
  const start = num(part?.time?.start) ?? num(part?.time?.created) ?? num(part?.start) ?? num(part?.timeStart);
  const end = num(part?.time?.end) ?? num(part?.time?.completed) ?? num(part?.end) ?? num(part?.timeEnd);
  let ms = num(part?.duration) ?? num(part?.durationMs) ?? num(part?.ms);
  if (ms === void 0 && start !== void 0 && end !== void 0 && end >= start) {
    ms = end - start;
    if (ms > 0 && ms < 1e3 && end < 1e12) ms = ms * 1e3;
  }
  if (ms === void 0 || ms < 0) return "";
  if (ms < 1e3) return `${Math.max(1, Math.round(ms))}ms`;
  if (ms < 6e4) return `${(ms / 1e3).toFixed(ms < 1e4 ? 1 : 0)}s`;
  const m = Math.floor(ms / 6e4);
  const s = Math.round(ms % 6e4 / 1e3);
  return `${m}m ${s}s`;
}
function formatPartForDisplay(part) {
  if (!part || typeof part !== "object") return "";
  const type = typeof part.type === "string" ? part.type : "";
  if (type === "step-start" || type === "step-finish" || type === "compaction") return "";
  const duration = formatPartDuration(part);
  if (type === "patch") {
    const files = Array.isArray(part.files) ? part.files.map((f) => String(f)).filter(Boolean) : [];
    const fullPaths = files.length ? files.map((f) => String(f)) : typeof part.path === "string" ? [part.path] : [];
    const fileLabel = fullPaths.map((f) => {
      const norm = f.replace(/\\/g, "/");
      return norm.includes("/") ? norm.slice(norm.lastIndexOf("/") + 1) : norm;
    }).join(", ") || (part.hash ? String(part.hash).slice(0, 12) : "edit");
    const body = typeof part.text === "string" && part.text.trim() ? part.text : typeof part.diff === "string" ? part.diff : typeof part.patch === "string" ? part.patch : "";
    let content = "";
    if (fullPaths.length) content += `IN:
${fullPaths.join("\n")}
`;
    if (body.trim()) content += `OUT:
${body}`;
    else if (part.hash) content += `OUT:
file edit \xB7 ${String(part.hash).slice(0, 12)}`;
    else content += `OUT:
${fileLabel}`;
    return wrapMimoPart("patch", "edit", fileLabel, content, false, duration);
  }
  if (type === "tool" || type === "tool_use") {
    const toolName = String(part.tool || part.name || "tool");
    const input = part.state && typeof part.state.input === "object" && part.state.input ? part.state.input : part.input && typeof part.input === "object" ? part.input : {};
    const pick = (...keys) => {
      for (const k of keys) {
        const v = input?.[k] ?? part?.[k];
        if (typeof v === "string" && v.trim()) return v;
      }
      return "";
    };
    let cmd = pick("command", "cmd");
    if (cmd && cmd.includes("\\n") && !cmd.includes("\n")) {
      cmd = cmd.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\t/g, "	");
    }
    if (cmd && cmd.length > 8e3) cmd = cmd.slice(0, 8e3) + "\n\u2026";
    const path = pick("file_path", "filePath", "path", "file", "filename", "target", "uri");
    const contentIn = pick("content", "text", "contents");
    const oldStr = pick("old_string", "oldString", "old_str", "before");
    const newStr = pick("new_string", "newString", "new_str", "after");
    const status = part.state?.status || part.status || "";
    const result = part.result || part.state?.output || part.output || part.state?.metadata?.output || "";
    const metaObj = part.state && typeof part.state.metadata === "object" && part.state.metadata ? part.state.metadata : part.metadata && typeof part.metadata === "object" ? part.metadata : {};
    const metaDiff = typeof metaObj?.diff === "string" ? String(metaObj.diff) : "";
    const metaPatch = typeof metaObj?.filediff?.patch === "string" ? String(metaObj.filediff.patch) : typeof metaObj?.patch === "string" ? String(metaObj.patch) : "";
    const isWrite = /^(write|edit|apply_patch|str_replace|create_file|notebook|multiedit)/i.test(
      toolName
    );
    const isEdit = /^(edit|str_replace|multiedit)/i.test(toolName);
    let body = "";
    if (cmd) body += `IN:
${cmd}
`;
    else if (path) body += `IN:
${path}
`;
    let outText = "";
    if ((isEdit || isWrite) && (metaDiff.trim() || metaPatch.trim())) {
      outText = metaDiff.trim() || metaPatch.trim();
    } else if (isEdit && (oldStr || newStr)) {
      const oldLines = oldStr ? oldStr.split("\n") : [];
      const newLines = newStr ? newStr.split("\n") : [];
      const maxShow = 120;
      const lines = [`--- a/${path || "file"}`, `+++ b/${path || "file"}`];
      for (let i = 0; i < Math.min(oldLines.length, maxShow); i++) lines.push("-" + oldLines[i]);
      if (oldLines.length > maxShow) lines.push(`-\u2026 (${oldLines.length - maxShow} more lines)`);
      for (let i = 0; i < Math.min(newLines.length, maxShow); i++) lines.push("+" + newLines[i]);
      if (newLines.length > maxShow) lines.push(`+\u2026 (${newLines.length - maxShow} more lines)`);
      outText = lines.join("\n");
    } else if (isWrite && contentIn) {
      outText = contentIn.length > 12e3 ? contentIn.slice(0, 12e3) + `
\u2026 (${contentIn.length} chars total)` : contentIn;
    } else if (typeof result === "string" && result.trim()) {
      outText = result;
    } else if (typeof part.text === "string" && part.text.trim() && !cmd && !path) {
      outText = part.text;
    }
    if (typeof outText === "string" && outText.length > 16e3) {
      outText = outText.slice(0, 16e3) + "\n\u2026";
    }
    if (outText) {
      body += `OUT:
${outText}`;
    } else {
      const fallback = status && status !== "completed" ? status : isWrite || isEdit ? "ok" : status || toolName;
      if (!body) {
        body = path ? `IN:
${path}
OUT:
${fallback}` : `OUT:
${fallback}`;
      } else if (!/^OUT:/m.test(body)) {
        body += `OUT:
${fallback}`;
      }
    }
    const open = status === "running" || status === "pending";
    const baseName = path ? String(path).replace(/\\/g, "/").split("/").pop() || String(path) : "";
    const isBashTool = /^(bash|shell|cmd|powershell|pwsh)$/i.test(toolName);
    const bashHint = isBashTool && cmd ? cmd.split("\n")[0].replace(/\s+/g, " ").slice(0, 88) : "";
    const meta = baseName || bashHint || (status && status !== "completed" ? String(status) : "");
    const title = isEdit ? "edit" : isWrite && /^write$/i.test(toolName) ? "write" : toolName;
    const hasMetaDiff = Boolean(metaDiff.trim() || metaPatch.trim());
    const hasDiffBody = typeof outText === "string" && (hasMetaDiff || outText.includes("\n+") || outText.includes("\n-") || /^\+/.test(outText) || /^-/.test(outText) || outText.startsWith("---") || outText.startsWith("Index:") || outText.startsWith("diff ") || outText.includes("\n@@"));
    const openCard = open || (isEdit || isWrite) && !isBashTool && (hasMetaDiff || hasDiffBody);
    return wrapMimoPart(isEdit ? "patch" : "tool", title, meta, body, openCard, duration);
  }
  if (type === "tool_result") {
    const body = typeof part.text === "string" ? part.text : "";
    return wrapMimoPart("tool", "result", "", body ? `OUT:
${body}` : "", false, duration);
  }
  if (type === "reasoning" || type === "thinking") {
    const body = typeof part.text === "string" ? part.text : "";
    if (!body.trim()) return "";
    return wrapMimoPart("thinking", "thinking", "", body, false, duration);
  }
  if (type === "file") {
    const p = part.path || part.text || "";
    return wrapMimoPart("file", "file", String(p), p ? `IN:
${p}` : "", false, duration);
  }
  if (type === "text" || type === "system" || !type) {
    return typeof part.text === "string" ? part.text : "";
  }
  if (typeof part.text === "string" && part.text.trim()) {
    return wrapMimoPart("tool", type, "", `OUT:
${part.text}`, false, duration);
  }
  return "";
}
function formatDbMessages(dbRows) {
  const result = [];
  for (const msg of dbRows) {
    const parts = Array.isArray(msg.parts) ? msg.parts : [];
    let fullText = "";
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
    const role = msg.role || msg.info?.role || "assistant";
    if (role !== "user" && role !== "assistant") continue;
    result.push({
      id: msg.id || msg.info?.id || "",
      role,
      text: fullText,
      time: msg.time ? { created: msg.time } : void 0
    });
  }
  return result;
}
function countToolMessages(messages) {
  return messages.filter(
    (m) => typeof m.text === "string" && (m.text.includes("%%MIMO_PART:tool") || m.text.includes("%%MIMO_PART:patch"))
  ).length;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  countMimoCards,
  countToolMessages,
  formatDbMessages,
  formatPartDuration,
  formatPartForDisplay,
  sanitizeHeaderField,
  splitMimoParts,
  wrapMimoPart
});

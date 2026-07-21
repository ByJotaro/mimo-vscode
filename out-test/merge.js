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

// src/host/session/merge.ts
var merge_exports = {};
__export(merge_exports, {
  collapseMessagesForDisplay: () => collapseMessagesForDisplay,
  mergeSessionMessagesById: () => mergeSessionMessagesById,
  textScore: () => textScore
});
module.exports = __toCommonJS(merge_exports);
function textScore(t) {
  if (!t) return 0;
  let s = t.length;
  if (t.includes("%%MIMO_PART")) s += 1e6;
  if (t.includes("%%MIMO_PART:tool") || t.includes("%%MIMO_PART:patch")) s += 5e5;
  if (t.includes("%%MIMO_PART:thinking")) s += 1e5;
  return s;
}
function mergeSessionMessagesById(baseMessages, incomingMessages) {
  const merged = Array.isArray(baseMessages) ? [...baseMessages] : [];
  const indexById = /* @__PURE__ */ new Map();
  for (let i = 0; i < merged.length; i++) {
    if (merged[i]?.id) indexById.set(merged[i].id, i);
  }
  if (!Array.isArray(incomingMessages)) return merged;
  for (const message of incomingMessages) {
    if (!message || typeof message.text !== "string") continue;
    const messageId = message.id || "";
    if (messageId && indexById.has(messageId)) {
      const idx = indexById.get(messageId);
      const prev = merged[idx];
      const prevText = prev.text || "";
      const nextText = message.text || "";
      const preferNext = textScore(nextText) > textScore(prevText);
      merged[idx] = {
        ...prev,
        ...message,
        id: messageId,
        role: message.role || prev.role,
        text: preferNext ? nextText : prevText || nextText
      };
      continue;
    }
    if (messageId) indexById.set(messageId, merged.length);
    merged.push(message);
  }
  return merged;
}
function collapseMessagesForDisplay(messages) {
  if (!Array.isArray(messages) || !messages.length) return [];
  const out = [];
  for (const item of messages) {
    if (!item?.id) continue;
    if (item.role === "system") {
      if (item.meta?.kind === "changeList") out.push(item);
      continue;
    }
    if (item.role === "user") {
      const text = String(item.text || "").replace(/^(\r?\n)+/, "");
      if (!text.trim()) continue;
      out.push({ ...item, text });
      continue;
    }
    if (item.role === "assistant") {
      if (!String(item.text || "").trim()) continue;
      out.push(item);
    }
  }
  return out;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  collapseMessagesForDisplay,
  mergeSessionMessagesById,
  textScore
});

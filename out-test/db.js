"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/host/db/index.ts
var db_exports = {};
__export(db_exports, {
  dbAvailable: () => dbAvailable,
  findSqlite3Bin: () => findSqlite3Bin,
  getMimoBin: () => getMimoBin,
  getMimoDbPath: () => getMimoDbPath,
  isJunkSessionTitle: () => isJunkSessionTitle,
  listSessionsFromSqlite: () => listSessionsFromSqlite,
  pickHomeRecent: () => pickHomeRecent,
  querySessionFromDb: () => querySessionFromDb,
  runSqliteJson: () => runSqliteJson,
  runSqliteTsv: () => runSqliteTsv
});
module.exports = __toCommonJS(db_exports);

// src/host/db/paths.ts
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var cp = __toESM(require("child_process"));
function getMimoDbPath() {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const candidates = [
    path.join(home, ".local", "share", "mimocode", "mimocode.db"),
    path.join(home, "AppData", "Roaming", "mimocode", "mimocode.db")
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
    }
  }
  return candidates[0] || "";
}
function findSqlite3Bin() {
  const candidates = [
    "C:\\Program Files\\platform-tools\\sqlite3.exe",
    "C:\\msys64\\ucrt64\\bin\\sqlite3.exe",
    "sqlite3",
    "sqlite3.exe"
  ];
  for (const c of candidates) {
    try {
      if (c.includes("\\") || c.includes("/")) {
        if (fs.existsSync(c)) return c;
      } else {
        cp.execFileSync(c, ["-version"], {
          encoding: "utf8",
          windowsHide: true,
          timeout: 2e3
        });
        return c;
      }
    } catch {
    }
  }
  return null;
}
function getMimoBin() {
  const envBin = process.env.MIMO_BIN;
  if (envBin) return envBin;
  const home = process.env.USERPROFILE || process.env.HOME || "";
  if (process.platform === "win32") {
    const candidates = [
      path.join(
        home,
        "AppData",
        "Roaming",
        "npm",
        "node_modules",
        "@mimo-ai",
        "cli",
        "node_modules",
        "@mimo-ai",
        "mimocode-windows-x64",
        "bin",
        "mimo.exe"
      ),
      path.join(
        home,
        "AppData",
        "Roaming",
        "npm",
        "node_modules",
        "@mimo-ai",
        "mimocode-windows-x64",
        "bin",
        "mimo.exe"
      )
    ];
    for (const c of candidates) {
      try {
        if (fs.existsSync(c)) return c;
      } catch {
      }
    }
  }
  return "mimo";
}

// src/host/db/sqlite.ts
var cp2 = __toESM(require("child_process"));
var fs2 = __toESM(require("fs"));
function runSqliteJson(sql, dbPath) {
  const db = dbPath || getMimoDbPath();
  const bin = findSqlite3Bin();
  if (!db || !bin || !fs2.existsSync(db)) return null;
  try {
    const out = cp2.execFileSync(bin, ["-json", db, sql], {
      encoding: "utf8",
      maxBuffer: 80 * 1024 * 1024,
      windowsHide: true,
      timeout: 3e4
    });
    const text = String(out || "").trim();
    if (!text) return [];
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return null;
  }
}
function runSqliteTsv(sql, dbPath) {
  const db = dbPath || getMimoDbPath();
  const bin = findSqlite3Bin();
  if (!db || !bin || !fs2.existsSync(db)) return "";
  try {
    return cp2.execFileSync(bin, ["-separator", "	", db, sql], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
      timeout: 1e4
    });
  } catch {
    return "";
  }
}

// src/host/db/querySession.ts
var fs3 = __toESM(require("fs"));
function querySessionFromDb(sessionId, limit = 24) {
  const t0 = Date.now();
  const safeLimit = Math.max(1, Math.floor(Number.isFinite(limit) ? limit : 24));
  const esc = (s) => s.replace(/'/g, "''");
  const sid = esc(sessionId);
  const sql = `SELECT p.message_id as mid, json_extract(m.data,'$.role') as role, json_extract(p.data,'$.type') as type, substr(COALESCE(json_extract(p.data,'$.text'),''),1,12000) as text, json_extract(p.data,'$.tool') as tool, substr(COALESCE(json_extract(p.data,'$.state.input.command'),''),1,6000) as cmd, json_extract(p.data,'$.state.input.file_path') as path, substr(COALESCE(json_extract(p.data,'$.state.input.old_string'),''),1,8000) as old_string, substr(COALESCE(json_extract(p.data,'$.state.input.new_string'),''),1,8000) as new_string, substr(COALESCE(json_extract(p.data,'$.state.input.content'),''),1,8000) as content, substr(COALESCE(json_extract(p.data,'$.state.metadata.diff'),''),1,12000) as meta_diff, substr(COALESCE(json_extract(p.data,'$.state.metadata.filediff.patch'),''),1,12000) as meta_patch, substr(COALESCE(json_extract(p.data,'$.state.output'),''),1,8000) as result, json_extract(p.data,'$.callID') as callID, json_extract(p.data,'$.hash') as hash, json_extract(p.data,'$.files') as files, p.time_created as time FROM part p JOIN (  SELECT id as message_id FROM message WHERE session_id = '${sid}'   ORDER BY time_created DESC LIMIT ${safeLimit}) sm ON p.message_id = sm.message_id JOIN message m ON m.id = p.message_id WHERE p.session_id = '${sid}' ORDER BY m.time_created ASC, p.time_created ASC;`;
  const arr = runSqliteJson(sql) || [];
  const byMsg = /* @__PURE__ */ new Map();
  const order = [];
  for (const row of arr) {
    if (!row || !row.mid) continue;
    if (!byMsg.has(row.mid)) {
      byMsg.set(row.mid, { id: row.mid, role: row.role, parts: [] });
      order.push(row.mid);
    }
    if (typeof row.files === "string" && row.files.startsWith("[")) {
      try {
        row.files = JSON.parse(row.files);
      } catch {
      }
    }
    byMsg.get(row.mid).parts.push(row);
  }
  const messages = order.map((id) => byMsg.get(id));
  let title = sessionId;
  let totalMessages = messages.length;
  const meta = runSqliteJson(
    `SELECT title, (SELECT count(*) FROM message WHERE session_id = '${sid}') as total FROM session WHERE id = '${sid}' LIMIT 1;`
  );
  if (Array.isArray(meta) && meta[0]) {
    if (meta[0].title) title = String(meta[0].title);
    const t = meta[0].total;
    if (typeof t === "number") totalMessages = t;
    else if (typeof t === "string") totalMessages = parseInt(t, 10) || totalMessages;
  }
  const olderCount = Math.max(0, totalMessages - messages.length);
  return {
    session: { id: sessionId, title },
    messages,
    meta: {
      totalMessages,
      olderCount,
      loaded: messages.length,
      limit: safeLimit,
      ms: Date.now() - t0
    }
  };
}
function isJunkSessionTitle(title) {
  const t = String(title || "").trim();
  if (!t || t.length < 2) return true;
  if (/^untitled(\s+session)?$/i.test(t)) return true;
  if (/^new session(\s|$|-)/i.test(t)) return true;
  if (/^one-word greeting/i.test(t)) return true;
  if (/checkpoint[- ]?writer/i.test(t)) return true;
  if (/previous checkpoint/i.test(t)) return true;
  if (/^summary(\s|$|:)/i.test(t)) return true;
  if (/^title(\s|$|:)/i.test(t)) return true;
  if (/^compaction(\s|$|:)/i.test(t)) return true;
  if (/^explore-\d+/i.test(t)) return true;
  if (/^general-\d+/i.test(t)) return true;
  if (/^ses_[a-zA-Z0-9]+$/i.test(t)) return true;
  return false;
}
function listSessionsFromSqlite(limit = 12, opts) {
  const want = Math.max(1, Math.min(80, Math.floor(limit)));
  const fetchN = Math.min(400, Math.max(want * 8, 40));
  const where = opts?.includeForks ? `WHERE 1=1 ` : `WHERE (parent_id IS NULL OR parent_id = '') `;
  const sql = `SELECT id, COALESCE(title,''), COALESCE(time_updated,0), COALESCE(time_created,0) FROM session ${where}AND COALESCE(title,'') NOT LIKE '%checkpoint-writer%' AND COALESCE(title,'') NOT LIKE '%Previous checkpoint%' AND COALESCE(title,'') NOT LIKE 'Untitled%' AND COALESCE(title,'') NOT LIKE 'New session%' ORDER BY COALESCE(time_updated, time_created, 0) DESC LIMIT ${fetchN};`;
  const out = runSqliteTsv(sql);
  const lines = String(out || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const result = [];
  for (const line of lines) {
    const cols = line.split("	");
    if (!cols[0]) continue;
    const id = cols[0];
    if (id === "_loading") continue;
    const title = cols[1] || "";
    if (isJunkSessionTitle(title)) continue;
    const updatedMs = Number(cols[2] || cols[3] || 0) || 0;
    result.push({
      id,
      title: title || id,
      updated: updatedMs ? new Date(updatedMs < 1e12 ? updatedMs * 1e3 : updatedMs).toLocaleString() : ""
    });
    if (result.length >= want) break;
  }
  return result;
}
function pickHomeRecent(sessions, cap = 6) {
  const real = sessions.filter((s) => {
    if (!s?.id || s.id === "_loading") return false;
    return !isJunkSessionTitle(s.title);
  });
  return real.slice(0, Math.max(1, Math.min(80, cap)));
}
function dbAvailable() {
  const p = getMimoDbPath();
  return Boolean(p && fs3.existsSync(p) && findSqlite3Bin());
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  dbAvailable,
  findSqlite3Bin,
  getMimoBin,
  getMimoDbPath,
  isJunkSessionTitle,
  listSessionsFromSqlite,
  pickHomeRecent,
  querySessionFromDb,
  runSqliteJson,
  runSqliteTsv
});

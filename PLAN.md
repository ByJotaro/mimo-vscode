# MiMo Code VS Code Extension — Implementation Plan (v1 Chat MVP)

## 1. Goal & Scope

Build a **public** VS Code extension that embeds **MiMo Code** (the installed `mimo` CLI — a fork of opencode) and presents a **visual chat UI** in the Activity Bar sidebar.

The extension launches the `mimo serve` headless HTTP server as a child process, parses its ephemeral loopback port from STDOUT, and talks to the REST API from the **extension host** via `fetch`. The sidebar webview (SolidJS) communicates only through a `postMessage` bridge to the host — it never opens its own socket, exactly mirroring the opencode-gui reference architecture.

### v1 scope (Chat MVP)
- Start/stop `mimo serve` subprocess (lifecycle bound to extension activation/deactivation).
- Sidebar chat: send prompt, receive assistant response, render message history.
- Thinking indicator while awaiting a response.
- Load existing sessions + messages on webview ready.
- Codex-like rounded/soft UI with the signature **MiMo colored left vertical bar** on the prompt input.
- Adaptive theming via `--vscode-*` CSS variables.
- Publish to a public GitHub repo under user `ByJotaro`.

### Explicit non-goals (v2+)
- Streaming responses via SSE/WebSocket (v1 shows a thinking indicator then the full response).
- Tool-call visualization, diff views, file-tree integration.
- Agent switching / multi-agent UIs (single default session is fine for v1).
- Auth/password hardening (loopback + ephemeral port is sufficient for local use).
- Settings UI / configurable port.
- Custom MiMo SDK package (none exists on npm; we spawn the CLI directly).

---

## 2. Architecture Overview

```
 ┌─────────────────────────────────────────────────────────────┐
 │  VS Code Extension Host                                       │
 │                                                               │
 │  src/extension.ts  ── creates MimoService + MimoViewProvider  │
 │        │                          │                           │
 │        ▼                          ▼                           │
 │  MimoService                 MimoViewProvider                │
 │  - spawn `node <mimo-bin>    - WebviewViewProvider           │
 │    serve --port 0            - postMessage bridge <-> webview│
 │    --hostname 127.0.0.1`     - proxyFetch(host-side fetch)   │
 │  - parse PORT from STDOUT    - CSP: connect-src 127.0.0.1    │
 │  - baseUrl = http://...:PORT - init/ready handshake          │
 │  - fetch REST API            - dev server support            │
 │  - dispose = kill process tree                               │
 │        │                          ▲                           │
 │        ▼                          │ postMessage               │
 │  ┌──────────────────────────────────────────┐               │
 │  │  mimo serve subprocess (HTTP REST)         │               │
 │  │  GET  /session          -> list sessions   │               │
 │  │  GET  /session/:id/...  -> messages (probe)│               │
 │  │  POST /session/:id/...  -> send prompt     │               │
 │  │  listens on 127.0.0.1:PORT (ephemeral)     │               │
 │  └──────────────────────────────────────────┘               │
 └─────────────────────────────────────────────────────────────┘
        ▲ postMessage (control + data tunnel)
        │
 ┌──────┴──────────────────────────────────────────┐
 │  Sidebar Webview (SolidJS)                         │
 │  index.html -> main.js (Vite build) + App.css      │
 │  App.tsx -> TopBar, MessageList, InputBar          │
 │  hooks/useMimo.ts -> talks to host via vscode.ts   │
 │  NO direct socket; all server calls proxied.       │
 └───────────────────────────────────────────────────┘
```

**Key principle (from opencode-gui):** the webview contains *no* network code to the server. It calls `window.vscode` (acquireVsCodeApi) which `postMessage`s a `proxyFetch`/`sseSubscribe` request to the host; the host performs the `fetch` to `mimo serve` and returns the result. This keeps the webview CSP strict and the server loopback-only.

---

## 3. Project Structure (every file to create)

Root: `D:\С_PROJECTS\mimo-vscode` (note Cyrillic `С` in `С_PROJECTS` — fine on NTFS).

| File | Responsibility |
|------|----------------|
| `package.json` | Extension manifest: `main ./dist/extension.js`, `publisher ByJotaro`, `engines.vscode ^1.74.0`, `contributes` (viewsContainers, views, commands, menus), `scripts` (build/watch/package/publish), deps (`solid-js`, `marked`, `vite`, `vite-plugin-solid`, `concurrently`, `typescript`, `@types/vscode`, `@vscode/vsce`). |
| `.vscodeignore` | Exclude `src/`, `out/`, `*.ts`, `vite.config*`, `tsconfig*`, `node_modules/.cache` from the packaged `.vsix`. |
| `.vscode/launch.json` | Debug config "Run Extension" (Launch VS Code Extension, `preLaunchTask: npm: watch`). |
| `.vscode/tasks.json` | Task `npm: watch` running `npm run watch` for the debug build. |
| `vite.config.extension.ts` | Lib build (CJS), entry `src/extension.ts`, `outDir dist`, `external` `vscode` + node builtins. |
| `vite.config.ts` | SolidJS build, `outDir out`, builds `src/webview/index.html` → `main.js` + `App.css`, `base: ''`. |
| `tsconfig.json` | Root referencing `tsconfig.extension.json` + `tsconfig.webview.json`. |
| `tsconfig.extension.json` | Node/ESM for host code; `types: ["node","vscode"]`; `moduleResolution bundler`. |
| `tsconfig.webview.json` | DOM/SolidJS for webview; `jsx: preserve`, `jsxImportSource: solid-js`. |
| `src/extension.ts` | Entry. Create `LogOutputChannel`, `MimoService`, `MimoViewProvider`; register view `mimo.chatView`; register command `mimo.addSelectionToPrompt`; dispose service on deactivate. |
| `src/MimoService.ts` | Spawn `node <mimo-bin> serve --port 0 --hostname 127.0.0.1`; parse `/listening on http:\/\/127.0.0.1:(\d+)/` from stdout; expose `getServerUrl()`, `getSessions()`, `getMessages(id)`, `createSession()`, `sendPrompt(id,text)`, `isReady()`, `dispose()`. |
| `src/MimoViewProvider.ts` | `WebviewViewProvider`. postMessage bridge, `_pendingMessages` queue flushed on `ready`, `proxyFetch` (AbortController + same-origin to server), dev-server HTML when `MIMO_DEV_SERVER_URL` set, CSP with `connect-src 127.0.0.1 localhost`. |
| `src/shared/messages.ts` | Shared TS types for host<->webview messages (control + proxyFetch envelope, server shapes). Imported by both host and webview. |
| `src/webview/index.html` | Webview HTML shell; loads `../out/main.js` + `../out/App.css` with nonce; meta CSP nonce. |
| `src/webview/App.tsx` | Root SolidJS component. Holds chat state, calls `useMimo()`, renders TopBar/MessageList/InputBar, fires load on `ready`. |
| `src/webview/components/InputBar.tsx` | Rounded prompt input with **MiMo left accent bar**; Enter to send, Shift+Enter newline; send via `useMimo`. |
| `src/webview/components/MessageList.tsx` | Scrollable list of `MessageBubble`; auto-scroll to bottom; shows `ThinkingIndicator` while awaiting. |
| `src/webview/components/TopBar.tsx` | Title bar "MiMo Code" + session info; status dot (connected/disconnected). |
| `src/webview/components/MessageBubble.tsx` | One message bubble (user right / assistant left, rounded, soft shadow); renders markdown via `marked`. |
| `src/webview/components/ThinkingIndicator.tsx` | Animated three-dot "thinking" indicator. |
| `src/webview/hooks/useMimo.ts` | Wraps `vscode.ts`; exposes `loadSessions()`, `loadMessages(id)`, `sendPrompt(text)`, `connected` signal. All server calls go through host proxyFetch. |
| `src/webview/utils/vscode.ts` | `acquireVsCodeApi()` wrapper; `postMessage` + promise-based `proxyFetch` request/response correlation by `requestId`. |
| `src/webview/styles/App.css` | Codex-like styling: `--mimo-accent` token, border-radius 12–16px, soft shadows, system font stack, `--vscode-*` vars, left accent bar styles. |
| `media/icon.svg` | Activity-bar icon (simple MiMo glyph). Referenced by `viewsContainers`. |

---

## 4. Step-by-Step Implementation Tasks

**T1 — Scaffold & manifest**
- `git init` in `D:\С_PROJECTS\mimo-vscode`.
- Write `package.json` with the `contributes` block:
  - `viewsContainers.activitybar: [{ id: "mimo", title: "MiMo Code", icon: "media/icon.svg" }]`
  - `views: { mimo: [{ type: "webview", id: "mimo.chatView", name: "Chat" }] }`
  - `commands: [{ command: "mimo.addSelectionToPrompt", title: "Add Selection to MiMo Prompt" }]`
  - `menus.editor/context` entry for the command.
  - `activationEvents: []` (lazy; view activation), `main: "./dist/extension.js"`.
  - `scripts`: `build` = `npm run build:extension && npm run build:webview`; `build:extension` = `vite build --config vite.config.extension.ts`; `build:webview` = `vite build`; `watch` = `concurrently "vite build --config vite.config.extension.ts --watch" "vite build --watch"`; `package` = `vsce package`; `publish` = `vsce publish`.

**T2 — Vite + TS configs**
- `vite.config.extension.ts`: `@vscode/vsce`-friendly CJS lib build, externalize `vscode`, `child_process`, `path`, `util`, `http`, `https`, `stream`, `events`, `os`, `url`, `fs`.
- `vite.config.ts`: `vite-plugin-solid`, `build.outDir out`, `build.rollupOptions.input src/webview/index.html`, `base: ''`.
- `tsconfig.*.json` as described in §3.

**T3 — shared/messages.ts**
- Define: `ServerMessage` envelope `{ kind: "control"|"proxyResponse"; ... }`, `ProxyRequest { requestId, method, path, body? }`, `ProxyResponse { requestId, status, body }`, `ControlMsg { type: "ready"|"init"|... }`, plus `Session`, `Message` shapes.

**T4 — MimoService.ts**
- Resolve mimo bin at runtime: `require.resolve('@mimo-ai/cli/bin/mimo')` fallback to `npm root -g` lookup, then spawn `node <bin> serve --port 0 --hostname 127.0.0.1` (spawn the **node bin directly** on Windows — NOT the `.ps1` wrapper).
- Capture `stdout`; on line matching `/listening on http:\/\/127\.0\.0\.1:(\d+)/`, set `baseUrl = "http://127.0.0.1:$1"` and `ready = true`.
- `waitUntilReady(timeout 15000)` rejects on timeout.
- `getServerUrl()`, `isReady()`, `getSessions()` → `GET /session`, `getMessages(id)` → `GET /session/${id}/message` (probe; adjust path if needed), `createSession()` → `POST /session`, `sendPrompt(id, text)` → `POST /session/${id}/prompt` (probe; adjust).
- `dispose()`: kill process + child tree (`tree-kill` or `taskkill /pid /t /f` on Windows).

**T5 — MimoViewProvider.ts**
- Mirror `OpenCodeViewProvider`: implement `resolveWebviewView`, set `webview.html` (dev server URL if `MIMO_DEV_SERVER_URL`, else bundled `out/main.js`+`out/App.css` with nonce).
- CSP meta: `default-src 'none'; img-src https: data:; script-src 'nonce-...'; style-src 'unsafe-inline' 'nonce-...'; connect-src 127.0.0.1 localhost;`.
- `postMessage` with `_pendingMessages` flushed on webview `ready` control message.
- `onDidReceiveMessage`: handle `ready` (flush queue), `proxyFetch` (host `fetch` to `baseUrl + req.path`, same-origin enforced, `AbortController`), `open-file`/`search-files` (optional stubs).
- Expose `proxyFetch` to service via closure.

**T6 — Webview SolidJS UI**
- `utils/vscode.ts`: `acquireVsCodeApi()` + `proxyFetch(method, path, body?)` returning a Promise keyed by incrementing `requestId`; listen for matching `proxyResponse`.
- `hooks/useMimo.ts`: signals `connected`, `sessions`, `activeSessionId`, `messages`, `thinking`; `loadSessions`/`loadMessages`/`sendPrompt` via `proxyFetch`; on send, push optimistic user message, set `thinking=true`, await response, push assistant message, clear thinking.
- `App.tsx`: layout TopBar + MessageList + InputBar; `onMount` post `ready` and `loadSessions`.
- Components per §3 with the **signature MiMo left accent bar** on `InputBar` (a `::before` vertical strip in `--mimo-accent`).

**T7 — Design spec (App.css)**
- `--mimo-accent: #6d5efc;` (indigo/purple) with a subtle gradient option; `--mimo-accent-soft` for hover.
- Border-radius 12–16px on inputs/bubbles; 1px hairline borders using `--vscode-widget-border`; soft box-shadow `0 1px 4px rgba(0,0,0,.08)`.
- System font stack (`-apple-system, "Segoe UI", system-ui, sans-serif`).
- All surfaces reference `--vscode-editor-background`, `--vscode-foreground`, `--vscode-input-*`, `--vscode-badge-*`, etc.
- User bubbles right-aligned accent tint; assistant left-aligned neutral.

**T8 — icon + debug config**
- `media/icon.svg` (16×16 viewBox simple glyph).
- `.vscode/launch.json` + `tasks.json` for F5.

**T9 — Live transport (PROBED & CONFIRMED 2026-07-17)**
Two transports, both verified working on mimo 0.1.6:

1. **Read path — `mimo serve` REST (for sessions + history):**
   - `GET /session` → JSON array of sessions (`id`, `slug`, `title`, `directory`, `parentID`, `time`).
   - `GET /session/:id/message` → JSON array of message objects (full session log incl. tool calls / file diffs).
   - `POST /session` → creates a session, returns `{id, slug, title, ...}` (200).
   - `mimo serve` prints `mimo code server listening on http://127.0.0.1:PORT` to STDOUT. With `--port 0` it still came up on 4096 in testing; parse the port from the stdout line rather than assuming. Server stays alive until killed.
   - NOTE: `POST /session/:id/prompt` returns **503 "Web UI is temporarily unavailable."** — DO NOT use it.

2. **Write path — `mimo run` (for sending a prompt + getting the reply):**
   - `mimo run "<prompt>" --format json` spawns a headless run, creates a session, and streams newline-delimited JSON events to STDOUT:
     `{"type":"step_start",...}` → `{"type":"text","text":"...",...}` → `{"type":"step_finish","tokens":{...},...}`.
   - To continue an existing conversation chain: `mimo run "<prompt>" --continue --session <id> --format json`. NOTE: opencode-style behavior forks a **child** session (new id with `parentID`), so the conversation chain is parent→child; `GET /session` returns both. For a fresh chat, just `mimo run "<prompt>" --format json` (new session each time).
   - Each prompt = one short-lived `mimo run` subprocess; parse its STDOUT JSON line-by-line. Read done when process exits (or on `step_finish`).

So `MimoService` uses `mimo serve` (long-lived) for listing/loading, and `mimo run --format json` (per-prompt) for sending. No WebSocket/SSE needed.

---

## 5. Risks / Open Questions

- **(a) Exact endpoints — RESOLVED.** Read: `GET /session`, `GET /session/:id/message`, `POST /session` (all confirmed). Write: `mimo run --format json` (confirmed, returns `step_start`/`text`/`step_finish` JSON events). `POST /session/:id/prompt` is 503 and unused.
- **(b) Streaming.** `mimo run --format json` already streams events line-by-line (we get `text` deltas per part). v1 can render the `text` event as it arrives for a live feel; full token streaming is effectively free. (Upgraded from "request/response only".)
- **(c) Auth.** `mimo serve` without `MIMOCODE_SERVER_PASSWORD` prints an unsecured warning but listens; loopback + ephemeral port is fine. `mimo run` needs no server. No password needed.
- **(d) Windows spawn.** Spawn the `node` bin (`.../@mimo-ai/cli/bin/mimo`) directly, NOT the PowerShell `mimo` wrapper. For `mimo run`, spawn `node <bin> run ...` and read STDOUT.
- **(e) Port parsing.** Parse `listening on http://127.0.0.1:(\d+)` from `mimo serve` STDOUT; fall back to 4096 if not found.
- **(f) Session chain.** `--continue --session` forks a child session; maintain the "active session id" in extension state and always continue from the latest child for a continuous chat.

---

## 6. Git / Publish Steps

```powershell
cd "D:\С_PROJECTS\mimo-vscode"
git init
git add -A
git commit -m "feat: initial MiMo Code VS Code extension (chat MVP)"
gh repo create mimo-vscode --public --source=. --push -d "VS Code extension embedding MiMo Code with a visual chat UI"
# Commit convention: feat:, fix:, chore:, docs:
```

Note: the Cyrillic `С` in `D:\С_PROJECTS` is valid on Windows NTFS and works with git/gh.

---

## 7. Verification

1. `npm install`
2. `npm run build` — both `dist/extension.js` and `out/main.js`+`out/App.css` produced without TS errors.
3. Press **F5** → "Extension Development Host" launches.
4. Confirm Output channel shows `mimo code server listening on http://127.0.0.1:<PORT>`.
5. Open the **MiMo Code** Activity Bar → Chat view renders (rounded UI, left accent bar).
6. Type a prompt, send → thinking indicator appears → assistant response renders.
7. Reload the Extension Development Host → history persists (loaded from REST API).
8. `git`/`gh` push succeeds to public `ByJotaro/mimo-vscode`.

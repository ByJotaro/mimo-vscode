# MiMo Code VS Code Extension v2

## Goal
Full rewrite of `mimo-vscode` (0.6.x monolith) into a modular extension that is:
- **1:1** with MiMo Code CLI visuals (palette from `mimocode.json`, starfield, logo grid)
- **Fast** session open (sqlite3 tail, progressive load, virtual older spacer)
- **Tool-complete** (bash/edit/thinking cards via `%%MIMO_PART`)
- **Test-gated** — no ship without unit + e2e green

## Language & tooling
| Layer | Choice | Why |
|-------|--------|-----|
| Extension host | **TypeScript** | Only option for VS Code `vscode` API |
| Webview | **TypeScript → esbuild** | Modular TS, one `media/app.js` bundle |
| DB access | **sqlite3 CLI** (`-json`) | ~10× faster than `mimo db` on large sessions; no native node binding pain |
| Tests | **Node test runner** + pure functions | Zero jest flakiness; same format code host + tests |
| Package | vsce | Same as v1 |

## Package layout
```
mimo-vscode-v2/
  src/
    extension/          # activate, commands
    host/
      db/               # paths, sqlite, querySession
      format/           # wrapMimoPart, formatPart, formatMessages
      session/          # list, select, loadMore, merge
      cli/              # serve, SSE/REST client (later)
      theme/            # tokens from mimocode.json
      SidebarProvider.ts  # thin message router only
    webview/
      app/              # bootstrap, message bus
      session/          # hydrate, collapse, spacer
      parts/            # splitMimoParts, cards, diff
      scroll/           # pinBottom, loadMore preserve
      logo/             # canvas engine
      styles/           # theme.css, chat.css, logo.css
    shared/             # protocol types host↔webview
  media/                # bundled app.js + css + sfx + icon
  tests/unit|e2e
  scripts/
  docs/
```

## Data flow (session open)
1. Webview `selectSession` → host
2. Host `querySessionFromDb(id, limit=24)` via **sqlite3**
3. Host `formatMessages` → `%%MIMO_PART` cards
4. Post `sessionData` with `olderCount`, `pinBottom`, **no** `timelineMessageIds`
5. Webview: collapse keeps **all** assistants; spacer for older; pin bottom
6. Scroll up → `loadMoreSession` (+40) DB path; scrollTop += delta

## Invariants (never break)
1. MIMO_PART header: no `|` or `%` in fields; body escape close marker
2. Never full `exportSession` on open (API drops tools + slow)
3. Never replace DB tool text with sparse snapshot/API
4. Never hide intermediate assistants on history hydrate
5. List home Recent ≤ 6 real sessions
6. Theme colors only from official `mimocode.json` defs

## Port order (with tests each step)
1. ✅ scaffold + theme tokens
2. format (wrap/split/part) unit tests
3. db query + e2e on real mimocode.db
4. session list/select/loadMore host
5. webview parts + hydrate + scroll
6. logo + starfield + density CSS
7. live stream / send prompt
8. slash, models, modes
9. visual verify (Windows MCP + VS Code)
10. vsix + install + user accept

## Old tree
Keep `D:\С_PROJECTS\mimo-vscode` as reference until v2 accepts; then deprecate.

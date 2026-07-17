# MiMo Code — VS Code Extension

A VS Code extension that embeds **MiMo Code** (the `mimo` CLI) with a visual UI.

It brings the full `mimo` workflow into the editor sidebar: chat, sessions,
agents, MCP servers, models, providers, usage stats, plugins, debug tools and
configuration — all driven by the local `mimo` CLI.

## Features

- **Chat** — talk to MiMo Code; prompts are sent via `mimo run --format json`
  and streamed back token-by-token.
- **Sessions** — browse, open, export and delete sessions (`mimo session …`).
- **Agents** — list configured agents (`GET /agent`).
- **MCP** — view connected Model Context Protocol servers (`GET /mcp`).
- **Models** — list available models (`mimo models --verbose`).
- **Providers** — view configured AI providers and credentials
  (`mimo providers list / whoami`).
- **Stats** — token usage and cost statistics (`mimo stats`).
- **Plugins** — install plugins (`mimo plugin <module>`).
- **Debug** — troubleshooting utilities (`mimo debug <sub>`).
- **Config** — resolved configuration (`GET /config`).

## Requirements

- [Node.js](https://nodejs.org) (the extension spawns `node` to run the `mimo` bin)
- The `mimo` CLI installed globally:
  `npm install -g @mimo-ai/cli`
- A configured provider/credentials so `mimo run` can reach a model.

## How it works

On activation the extension starts a local `mimo serve` instance (loopback,
ephemeral port) used to read sessions/agents/mcp/config over REST. Chat prompts
are sent through short-lived `mimo run --format json --port 0` subprocesses, so
they never collide with the long-lived serve process.

## Commands

- `MiMo Code: Add Selection to Prompt` — send the current editor selection into
  the chat.
- `MiMo Code: New Chat Session` — start a fresh conversation.

## License

MIT

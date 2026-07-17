import { For, Show } from "solid-js";
import type { MimoState } from "../hooks/useMimo";

export function McpPanel(props: { mimo: MimoState }) {
  const m = props.mimo;
  const entries = () => Object.entries(m.mcp() as Record<string, { status: string }>);
  return (
    <div class="panel__inner">
      <header class="panel__header">
        <h2>MCP Servers</h2>
        <button class="btn" onClick={m.loadMcp}>
          Refresh
        </button>
      </header>
      <div class="list">
        <Show
          when={entries().length > 0}
          fallback={<div class="empty">No MCP servers configured.</div>}
        >
          <For each={entries()}>
            {([name, info]) => (
              <div class="card">
                <div class="card__title">{name}</div>
                <div class="card__meta">
                  <span
                    class="chip"
                    classList={{
                      "chip--ok": info.status === "connected",
                      "chip--bad": info.status !== "connected",
                    }}
                  >
                    {info.status}
                  </span>
                </div>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}

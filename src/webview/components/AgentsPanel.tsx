import { For, Show } from "solid-js";
import type { MimoState } from "../hooks/useMimo";

export function AgentsPanel(props: { mimo: MimoState }) {
  const m = props.mimo;
  return (
    <div class="panel__inner">
      <header class="panel__header">
        <h2>Agents</h2>
        <button class="btn" onClick={m.loadAgents}>
          Refresh
        </button>
      </header>
      <div class="list">
        <Show
          when={m.agents().length > 0}
          fallback={<div class="empty">No agents found.</div>}
        >
          <For each={m.agents()}>
            {(a: any) => (
              <div class="card">
                <div class="card__title">
                  <span
                    class="dot"
                    style={{ background: a.color || "var(--mimo-accent)" }}
                  />
                  {a.name}
                </div>
                <div class="card__desc">{a.description || ""}</div>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}

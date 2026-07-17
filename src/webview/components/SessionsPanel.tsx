import { For, Show } from "solid-js";
import type { MimoState } from "../hooks/useMimo";

export function SessionsPanel(props: { mimo: MimoState }) {
  const m = props.mimo;
  return (
    <div class="panel__inner">
      <header class="panel__header">
        <h2>Sessions</h2>
        <button class="btn" onClick={m.loadSessions}>
          Refresh
        </button>
      </header>
      <div class="list">
        <Show
          when={m.sessions().length > 0}
          fallback={<div class="empty">No sessions yet. Start a chat.</div>}
        >
          <For each={m.sessions()}>
            {(s) => (
              <div class="card">
                <div class="card__title" title={s.id}>
                  {s.title}
                </div>
                <div class="card__meta">
                  <span class="chip">{s.slug}</span>
                  <span class="chip chip--muted">{s.version}</span>
                  <Show when={s.parentID}>
                    <span class="chip chip--muted">child</span>
                  </Show>
                </div>
                <div class="card__actions">
                  <button class="btn btn--sm" onClick={() => m.loadMessages(s.id)}>
                    Open
                  </button>
                  <button
                    class="btn btn--sm"
                    onClick={() => m.sessionAction("export", s.id, true)}
                  >
                    Export
                  </button>
                  <button
                    class="btn btn--sm btn--danger"
                    onClick={() => {
                      if (confirm(`Delete session ${s.title}?`)) m.sessionAction("delete", s.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}

import { For, Show } from "solid-js";
import type { Session } from "../../shared/messages";

interface Props {
  sessions: Session[];
  activeSessionId?: string;
  onSelect: (id: string) => void;
  onNew: () => void;
}

export function TopBar(props: Props) {
  return (
    <header class="topbar">
      <div class="topbar__brand">
        <span class="topbar__dot" />
        <span class="topbar__title">MiMo Code</span>
      </div>
      <div class="topbar__sessions">
        <For each={props.sessions.slice(0, 12)}>
          {(s) => (
            <button
              class="session-chip"
              classList={{ "session-chip--active": s.id === props.activeSessionId }}
              title={s.title}
              onClick={() => props.onSelect(s.id)}
            >
              {s.title.replace(/^New session - /, "") || s.slug}
            </button>
          )}
        </For>
        <Show when={props.sessions.length === 0}>
          <span class="topbar__hint">No sessions yet</span>
        </Show>
      </div>
      <button class="topbar__new" title="New chat" onClick={props.onNew}>
        +
      </button>
    </header>
  );
}

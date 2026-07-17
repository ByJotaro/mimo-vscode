import { Show } from "solid-js";
import type { MimoState } from "../hooks/useMimo";

export function ConfigPanel(props: { mimo: MimoState }) {
  const m = props.mimo;
  const json = () => {
    try {
      return JSON.stringify(m.config(), null, 2);
    } catch {
      return String(m.config());
    }
  };
  return (
    <div class="panel__inner">
      <header class="panel__header">
        <h2>Configuration</h2>
        <button class="btn" onClick={m.loadConfig}>
          Refresh
        </button>
      </header>
      <div class="raw">
        <Show
          when={m.config() !== undefined}
          fallback={<div class="empty">Click “Refresh” to load config.</div>}
        >
          <pre class="raw__pre">{json()}</pre>
        </Show>
      </div>
    </div>
  );
}

import { Show } from "solid-js";
import type { MimoState, RawTopic } from "../hooks/useMimo";

export function RawPanel(props: {
  mimo: MimoState;
  topic: RawTopic;
  title: string;
  description?: string;
  onRefresh: () => void;
  refreshLabel?: string;
}) {
  const m = props.mimo;
  const data = () => m.raw()[props.topic];
  return (
    <div class="panel__inner">
      <header class="panel__header">
        <h2>{props.title}</h2>
        <button class="btn" onClick={props.onRefresh}>
          {props.refreshLabel || "Load"}
        </button>
      </header>
      <Show when={props.description}>
        <p class="panel__desc">{props.description}</p>
      </Show>
      <div class="raw">
        <Show
          when={data()}
          fallback={<div class="empty">Click “{props.refreshLabel || "Load"}” to fetch.</div>}
        >
          <Show when={data()!.loading}>
            <div class="raw__loading">Loading…</div>
          </Show>
          <Show when={!data()!.loading}>
            <pre class="raw__pre" classList={{ "raw__pre--err": !data()!.ok }}>
              {data()!.text || "(empty)"}
            </pre>
          </Show>
        </Show>
      </div>
    </div>
  );
}

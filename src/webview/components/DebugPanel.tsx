import { createSignal, For } from "solid-js";
import type { MimoState } from "../hooks/useMimo";
import { RawPanel } from "./RawPanel";

const SUBS = [
  "config",
  "paths",
  "scrap",
  "skill",
  "lsp",
  "rg",
  "file",
  "snapshot",
];

export function DebugPanel(props: { mimo: MimoState }) {
  const [sub, setSub] = createSignal<string>("config");
  return (
    <div>
      <div class="panel__tool-bar">
        <select class="select" onChange={(e) => setSub(e.currentTarget.value)}>
          <For each={SUBS}>{(s) => <option value={s}>debug {s}</option>}</For>
        </select>
        <button class="btn" onClick={() => props.mimo.debugAction(sub())}>
          Run
        </button>
      </div>
      <RawPanel
        mimo={props.mimo}
        topic="debug"
        title="Debug"
        description="Troubleshooting utilities (mimo debug <sub>)."
        onRefresh={() => props.mimo.debugAction(sub())}
        refreshLabel="Run"
      />
    </div>
  );
}

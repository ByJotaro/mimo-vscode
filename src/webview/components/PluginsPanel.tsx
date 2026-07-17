import { createSignal } from "solid-js";
import type { MimoState } from "../hooks/useMimo";
import { RawPanel } from "./RawPanel";

export function PluginsPanel(props: { mimo: MimoState }) {
  const [module, setModule] = createSignal("");
  const [global, setGlobal] = createSignal(false);
  const [force, setForce] = createSignal(false);
  const install = () => {
    const mod = module().trim();
    if (!mod) return;
    props.mimo.pluginAction(mod, global(), force());
    setModule("");
  };
  return (
    <div>
      <div class="panel__tool-bar">
        <input
          class="input"
          placeholder="npm module (e.g. @scope/plugin)"
          value={module()}
          onInput={(e) => setModule(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && install()}
        />
        <label class="chk">
          <input type="checkbox" checked={global()} onChange={(e) => setGlobal(e.currentTarget.checked)} /> global
        </label>
        <label class="chk">
          <input type="checkbox" checked={force()} onChange={(e) => setForce(e.currentTarget.checked)} /> force
        </label>
        <button class="btn" onClick={install}>
          Install
        </button>
      </div>
      <RawPanel
        mimo={props.mimo}
        topic="plugin"
        title="Plugins"
        description="Install a MiMo Code plugin (mimo plugin <module>)."
        onRefresh={() => props.mimo.fetchRaw("plugin")}
        refreshLabel="Show last"
      />
    </div>
  );
}

import { createSignal } from "solid-js";
import type { MimoState } from "../hooks/useMimo";
import { RawPanel } from "./RawPanel";

export function StatsPanel(props: { mimo: MimoState }) {
  const [days, setDays] = createSignal<number | undefined>(undefined);
  return (
    <div>
      <div class="panel__toolbar">
        <span>Range:</span>
        <select
          class="select"
          onChange={(e) => {
            const v = e.currentTarget.value;
            setDays(v ? Number(v) : undefined);
          }}
        >
          <option value="">All time</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
        <button class="btn" onClick={() => props.mimo.fetchRaw("stats", days())}>
          Load stats
        </button>
      </div>
      <RawPanel
        mimo={props.mimo}
        topic="stats"
        title="Token usage & cost"
        description="Usage statistics from mimo stats."
        onRefresh={() => props.mimo.fetchRaw("stats", days())}
        refreshLabel="Load"
      />
    </div>
  );
}

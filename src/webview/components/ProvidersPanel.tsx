import type { MimoState } from "../hooks/useMimo";
import { RawPanel } from "./RawPanel";

export function ProvidersPanel(props: { mimo: MimoState }) {
  return (
    <RawPanel
      mimo={props.mimo}
      topic="providers"
      title="Providers"
      description="Configured AI providers and credentials (mimo providers list)."
      onRefresh={() => props.mimo.fetchRaw("providers")}
      refreshLabel="Load providers"
    />
  );
}

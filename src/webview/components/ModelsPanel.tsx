import type { MimoState } from "../hooks/useMimo";
import { RawPanel } from "./RawPanel";

export function ModelsPanel(props: { mimo: MimoState }) {
  return (
    <RawPanel
      mimo={props.mimo}
      topic="models"
      title="Models"
      description="Available models from configured providers (mimo models --verbose)."
      onRefresh={() => props.mimo.fetchRaw("models")}
      refreshLabel="Load models"
    />
  );
}

import { createSignal, Show } from "solid-js";

interface Props {
  disabled: boolean;
  onSend: (text: string) => void;
}

export function InputBar(props: Props) {
  const [text, setText] = createSignal("");

  const submit = () => {
    const t = text().trim();
    if (!t || props.disabled) return;
    props.onSend(t);
    setText("");
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div class="inputbar">
      <div class="inputbar__box">
        {/* Signature MiMo accent bar on the left edge of the input */}
        <span class="inputbar__accent" aria-hidden="true" />
        <textarea
          class="inputbar__field"
          placeholder="Ask MiMo Code…"
          value={text()}
          disabled={props.disabled}
          onInput={(e) => setText(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          rows={1}
        />
        <button
          class="inputbar__send"
          classList={{ "inputbar__send--active": text().trim().length > 0 && !props.disabled }}
          disabled={props.disabled || text().trim().length === 0}
          onClick={submit}
          title="Send (Enter)"
        >
          ➤
        </button>
      </div>
      <Show when={props.disabled}>
        <div class="inputbar__hint">MiMo is thinking…</div>
      </Show>
    </div>
  );
}

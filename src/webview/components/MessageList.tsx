import { For, Show } from "solid-js";
import type { ChatMessage } from "../../shared/messages";
import { MessageBubble } from "./MessageBubble";
import { ThinkingIndicator } from "./ThinkingIndicator";

interface Props {
  messages: ChatMessage[];
  thinking: boolean;
}

export function MessageList(props: Props) {
  return (
    <div class="messages">
      <Show
        when={props.messages.length > 0 || props.thinking}
        fallback={
          <div class="messages__empty">
            <div class="messages__empty-logo">◈</div>
            <p>Ask MiMo Code anything about your code.</p>
          </div>
        }
      >
        <For each={props.messages}>{(m) => <MessageBubble message={m} />}</For>
        <Show when={props.thinking}>
          <ThinkingIndicator />
        </Show>
      </Show>
    </div>
  );
}

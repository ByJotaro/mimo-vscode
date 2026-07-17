import { Show } from "solid-js";
import type { MimoState } from "../hooks/useMimo";
import { TopBar } from "./TopBar";
import { MessageList } from "./MessageList";
import { InputBar } from "./InputBar";

export function ChatPanel(props: { mimo: MimoState }) {
  const m = props.mimo;
  return (
    <div class="panel__inner panel__inner--chat">
      <TopBar
        sessions={m.sessions()}
        activeSessionId={m.activeSessionId()}
        onSelect={m.loadMessages}
        onNew={m.newSession}
      />
      <MessageList messages={m.messages()} thinking={m.thinking()} />
      <InputBar disabled={!m.ready() || m.thinking()} onSend={m.sendPrompt} />
    </div>
  );
}

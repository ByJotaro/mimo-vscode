import type { ChatMessage } from "../../shared/messages";

interface Props {
  message: ChatMessage;
}

/** Render text with minimal markdown: code fences and line breaks. */
function renderText(text: string): string {
  // Basic HTML escaping, then preserve newlines. Full markdown is v2.
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");
}

export function MessageBubble(props: Props) {
  const isUser = () => props.message.role === "user";
  return (
    <div class="bubble" classList={{ "bubble--user": isUser(), "bubble--assistant": !isUser() }}>
      <div class="bubble__role">{isUser() ? "You" : "MiMo"}</div>
      <div class="bubble__text" innerHTML={renderText(props.message.text)} />
      {props.message.streaming && <span class="bubble__caret" />}
    </div>
  );
}

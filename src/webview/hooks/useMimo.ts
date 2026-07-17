import { createSignal, onCleanup, onMount } from "solid-js";
import type { AgentDef, ChatMessage, McpServerStatus, Session } from "../../shared/messages";
import { onHostMessage, postToHost } from "../utils/vscode";

export type RawTopic =
  | "models"
  | "providers"
  | "providers-whoami"
  | "stats"
  | "export"
  | "import"
  | "plugin"
  | "debug"
  | "version";

export interface MimoState {
  ready: () => boolean;
  version: () => string | undefined;
  sessions: () => Session[];
  activeSessionId: () => string | undefined;
  messages: () => ChatMessage[];
  thinking: () => boolean;
  error: () => string | undefined;
  agents: () => AgentDef[];
  mcp: () => Record<string, McpServerStatus>;
  config: () => unknown;
  raw: () => Record<string, { text: string; ok: boolean; loading: boolean }>;
  loadSessions: () => void;
  loadMessages: (sessionId: string) => void;
  sendPrompt: (text: string) => void;
  newSession: () => void;
  loadAgents: () => void;
  loadMcp: () => void;
  loadConfig: () => void;
  fetchRaw: (topic: RawTopic, days?: number) => void;
  sessionAction: (action: "delete" | "export", sessionId: string, sanitize?: boolean) => void;
  pluginAction: (module: string, global?: boolean, force?: boolean) => void;
  debugAction: (sub: string) => void;
  dismissError: () => void;
}

export function useMimo(): MimoState {
  const [ready, setReady] = createSignal(false);
  const [version, setVersion] = createSignal<string | undefined>(undefined);
  const [sessions, setSessions] = createSignal<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = createSignal<string | undefined>(undefined);
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const [thinking, setThinking] = createSignal(false);
  const [error, setError] = createSignal<string | undefined>(undefined);
  const [agents, setAgents] = createSignal<AgentDef[]>([]);
  const [mcp, setMcp] = createSignal<Record<string, McpServerStatus>>({});
  const [config, setConfig] = createSignal<unknown>(undefined);
  const [raw, setRaw] = createSignal<Record<string, { text: string; ok: boolean; loading: boolean }>>({});

  const unsub = onHostMessage((data: any) => {
    if (!data || typeof data !== "object") return;
    switch (data.type) {
      case "init":
        setReady(data.ready);
        setVersion(data.version);
        setSessions(data.sessions ?? []);
        break;
      case "sessions":
        setSessions(data.sessions ?? []);
        break;
      case "messages":
        setMessages(data.messages ?? []);
        break;
      case "thinking":
        setThinking(data.value);
        break;
      case "message":
        setMessages((prev) => [...prev, data.message]);
        break;
      case "delta":
        setMessages((prev) =>
          prev.map((m) =>
            m.id === data.messageId ? { ...m, text: m.text + data.text, streaming: true } : m,
          ),
        );
        break;
      case "agents":
        setAgents(data.agents ?? []);
        break;
      case "mcp":
        setMcp(data.servers ?? {});
        break;
      case "config":
        setConfig(data.config);
        break;
      case "raw":
        setRaw((prev) => ({
          ...prev,
          [data.topic]: { text: data.text, ok: data.ok, loading: false },
        }));
        break;
      case "error":
        setError(data.message);
        setThinking(false);
        break;
    }
  });
  onCleanup(unsub);

  onMount(() => {
    postToHost({ type: "ready" });
  });

  const loadSessions = () => postToHost({ type: "loadSessions" });
  const loadMessages = (id: string) => {
    setActiveSessionId(id);
    setMessages([]);
    postToHost({ type: "loadMessages", sessionId: id });
  };
  const sendPrompt = (text: string) => {
    const t = text.trim();
    if (!t || thinking()) return;
    setError(undefined);
    setMessages((prev) => [...prev, { id: `u_${Date.now()}`, role: "user", text: t }]);
    setThinking(true);
    postToHost({ type: "sendPrompt", text: t, sessionId: activeSessionId() });
  };
  const newSession = () => {
    setActiveSessionId(undefined);
    setMessages([]);
    postToHost({ type: "newSession" });
  };
  const loadAgents = () => postToHost({ type: "loadAgents" });
  const loadMcp = () => postToHost({ type: "loadMcp" });
  const loadConfig = () => postToHost({ type: "loadConfig" });
  const fetchRaw = (topic: RawTopic, days?: number) => {
    setRaw((prev) => ({ ...prev, [topic]: { text: "", ok: true, loading: true } }));
    postToHost({ type: "fetchRaw", topic: topic as any, days });
  };
  const sessionAction = (action: "delete" | "export", sessionId: string, sanitize?: boolean) =>
    postToHost({ type: "sessionAction", action, sessionId, sanitize });
  const pluginAction = (module: string, global?: boolean, force?: boolean) =>
    postToHost({ type: "pluginAction", module, global, force });
  const debugAction = (sub: string) => postToHost({ type: "debugAction", sub });
  const dismissError = () => setError(undefined);

  return {
    ready,
    version,
    sessions,
    activeSessionId,
    messages,
    thinking,
    error,
    agents,
    mcp,
    config,
    raw,
    loadSessions,
    loadMessages,
    sendPrompt,
    newSession,
    loadAgents,
    loadMcp,
    loadConfig,
    fetchRaw,
    sessionAction,
    pluginAction,
    debugAction,
    dismissError,
  };
}

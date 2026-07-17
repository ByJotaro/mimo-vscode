// Shared types for host <-> webview message protocol.

/** A session as returned by the mimo serve REST API (GET /session). */
export interface Session {
  id: string;
  slug: string;
  projectID: string;
  directory: string;
  title: string;
  version: string;
  parentID?: string;
  summary?: { additions: number; deletions: number; files: number };
  time: { created: number; updated: number };
}

/** A chat message rendered in the UI. */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  streaming?: boolean;
}

export interface AgentDef {
  name: string;
  color?: string;
  description?: string;
  [key: string]: unknown;
}

export interface McpServerStatus {
  status: string;
  [key: string]: unknown;
}

// ---- Host -> Webview messages ----

export interface InitMessage {
  type: "init";
  ready: boolean;
  serverUrl?: string;
  sessions: Session[];
  version?: string;
}

export interface SessionsMessage {
  type: "sessions";
  sessions: Session[];
}

export interface MessagesMessage {
  type: "messages";
  sessionId: string;
  messages: ChatMessage[];
}

export interface ThinkingMessage {
  type: "thinking";
  sessionId: string;
  value: boolean;
}

export interface AppendMessage {
  type: "message";
  sessionId: string;
  message: ChatMessage;
}

export interface AppendDelta {
  type: "delta";
  sessionId: string;
  messageId: string;
  text: string;
}

export interface AgentsMessage {
  type: "agents";
  agents: AgentDef[];
}

export interface McpMessage {
  type: "mcp";
  servers: Record<string, McpServerStatus>;
}

export interface ConfigMessage {
  type: "config";
  config: unknown;
}

export interface RawTextMessage {
  type: "raw";
  topic:
    | "models"
    | "providers"
    | "providers-whoami"
    | "stats"
    | "export"
    | "delete"
    | "import"
    | "plugin"
    | "debug"
    | "version";
  text: string;
  ok: boolean;
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

export type HostMessage =
  | InitMessage
  | SessionsMessage
  | MessagesMessage
  | ThinkingMessage
  | AppendMessage
  | AppendDelta
  | AgentsMessage
  | McpMessage
  | ConfigMessage
  | RawTextMessage
  | ErrorMessage;

// ---- Webview -> Host messages ----

export interface ReadyMessage {
  type: "ready";
}

export interface LoadSessionsMessage {
  type: "loadSessions";
}

export interface LoadMessagesMessage {
  type: "loadMessages";
  sessionId: string;
}

export interface SendPromptMessage {
  type: "sendPrompt";
  text: string;
  sessionId?: string;
}

export interface NewSessionMessage {
  type: "newSession";
}

export interface LoadAgentsMessage {
  type: "loadAgents";
}

export interface LoadMcpMessage {
  type: "loadMcp";
}

export interface LoadConfigMessage {
  type: "loadConfig";
}

export interface FetchRawMessage {
  type: "fetchRaw";
  topic:
    | "models"
    | "providers"
    | "providers-whoami"
    | "stats"
    | "version";
  days?: number;
}

export interface SessionActionMessage {
  type: "sessionAction";
  action: "delete" | "export";
  sessionId: string;
  sanitize?: boolean;
}

export interface PluginActionMessage {
  type: "pluginAction";
  module: string;
  global?: boolean;
  force?: boolean;
}

export interface DebugActionMessage {
  type: "debugAction";
  sub: string;
}

export interface EditorSelectionMessage {
  type: "editor-selection";
  filePath: string;
  fileUrl: string;
  selection?: { startLine: number; endLine: number };
}

export type WebviewMessage =
  | ReadyMessage
  | LoadSessionsMessage
  | LoadMessagesMessage
  | SendPromptMessage
  | NewSessionMessage
  | LoadAgentsMessage
  | LoadMcpMessage
  | LoadConfigMessage
  | FetchRawMessage
  | SessionActionMessage
  | PluginActionMessage
  | DebugActionMessage
  | EditorSelectionMessage;

export function parseWebviewMessage(data: unknown): WebviewMessage | null {
  if (!data || typeof data !== "object") return null;
  const msg = data as Record<string, unknown>;
  switch (msg.type) {
    case "ready":
    case "loadSessions":
    case "newSession":
    case "loadAgents":
    case "loadMcp":
    case "loadConfig":
      return msg as unknown as WebviewMessage;
    case "loadMessages":
      if (typeof msg.sessionId === "string") return msg as unknown as WebviewMessage;
      return null;
    case "sendPrompt":
      if (typeof msg.text === "string") return msg as unknown as WebviewMessage;
      return null;
    case "fetchRaw":
      if (typeof msg.topic === "string") return msg as unknown as WebviewMessage;
      return null;
    case "sessionAction":
      if (typeof msg.sessionId === "string" && typeof msg.action === "string")
        return msg as unknown as WebviewMessage;
      return null;
    case "pluginAction":
      if (typeof msg.module === "string") return msg as unknown as WebviewMessage;
      return null;
    case "debugAction":
      if (typeof msg.sub === "string") return msg as unknown as WebviewMessage;
      return null;
    case "editor-selection":
      if (typeof msg.filePath === "string" && typeof msg.fileUrl === "string")
        return msg as unknown as WebviewMessage;
      return null;
    default:
      return null;
  }
}

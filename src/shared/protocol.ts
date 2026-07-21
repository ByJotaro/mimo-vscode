/** Host ↔ webview message protocol (v2). Keep small and versioned. */

export type SessionListItem = {
  id: string;
  title: string;
  updated?: string;
  parentID?: string;
};

export type DisplayMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  meta?: Record<string, unknown>;
  time?: { created?: number };
};

export type SessionDataMeta = {
  source: string;
  pinBottom?: boolean;
  loadMore?: boolean;
  hasToolCards?: boolean;
  toolMsgs?: number;
  limit?: number;
  olderCount?: number;
  totalMessages?: number;
  loadedCount?: number;
  loadMs?: number;
  preview?: boolean;
};

export type HostToWebview =
  | {
      type: 'init';
      sessions: SessionListItem[];
      models?: Array<{ fullId: string; name?: string }>;
      modes?: string[];
      selectedModel?: string;
      selectedMode?: string;
      showStartupChooser?: boolean;
      slashCommands?: Array<{ name: string; description: string }>;
    }
  | {
      type: 'sessionData';
      sessionId: string;
      title: string;
      messages: DisplayMessage[];
      meta?: SessionDataMeta;
    }
  | { type: 'sessionLoadMoreStatus'; sessionId: string; loading: boolean; count?: number; olderCount?: number; error?: string }
  | { type: 'sessionsList'; sessions: SessionListItem[] }
  | { type: 'sessionLoadFailed'; sessionId?: string; error?: string };

export type WebviewToHost =
  | { type: 'ready' }
  | { type: 'selectSession'; sessionId: string }
  | { type: 'loadMoreSession'; sessionId: string; count?: number }
  | { type: 'fetchSessions' }
  | { type: 'newSession' }
  | { type: 'sendPrompt'; text: string; sessionId?: string; mode?: string; model?: string }
  | { type: 'ui-debug'; payload: string[] };

import { Show, createSignal, For } from "solid-js";
import { useMimo } from "./hooks/useMimo";
import { ChatPanel } from "./components/ChatPanel";
import { SessionsPanel } from "./components/SessionsPanel";
import { AgentsPanel } from "./components/AgentsPanel";
import { McpPanel } from "./components/McpPanel";
import { ModelsPanel } from "./components/ModelsPanel";
import { ProvidersPanel } from "./components/ProvidersPanel";
import { StatsPanel } from "./components/StatsPanel";
import { PluginsPanel } from "./components/PluginsPanel";
import { DebugPanel } from "./components/DebugPanel";
import { ConfigPanel } from "./components/ConfigPanel";

type Tab = "chat" | "sessions" | "agents" | "mcp" | "models" | "providers" | "stats" | "plugins" | "debug" | "config";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "chat", label: "Chat", icon: "💬" },
  { id: "sessions", label: "Sessions", icon: "🗂" },
  { id: "agents", label: "Agents", icon: "🤖" },
  { id: "mcp", label: "MCP", icon: "🔌" },
  { id: "models", label: "Models", icon: "🧠" },
  { id: "providers", label: "Providers", icon: "🔑" },
  { id: "stats", label: "Stats", icon: "📊" },
  { id: "plugins", label: "Plugins", icon: "🧩" },
  { id: "debug", label: "Debug", icon: "🐞" },
  { id: "config", label: "Config", icon: "⚙" },
];

export default function App() {
  const mimo = useMimo();
  const [tab, setTab] = createSignal<Tab>("chat");

  return (
    <div class="app">
      <nav class="sidebar">
        <div class="sidebar__brand">
          <span class="sidebar__dot" />
          <span class="sidebar__name">MiMo</span>
        </div>
        <div class="sidebar__tabs">
          <For each={TABS}>
            {(t) => (
              <button
                class="sidebar__tab"
                classList={{ "sidebar__tab--active": tab() === t.id }}
                title={t.label}
                onClick={() => setTab(t.id)}
              >
                <span class="sidebar__icon">{t.icon}</span>
                <span class="sidebar__label">{t.label}</span>
              </button>
            )}
          </For>
        </div>
        <Show when={mimo.version()}>
          <div class="sidebar__ver">v{mimo.version()}</div>
        </Show>
      </nav>

      <main class="panel">
        <Show when={mimo.error()}>
          <div class="error-banner">
            <span>{mimo.error()}</span>
            <button class="error-banner__close" onClick={mimo.dismissError}>
              ×
            </button>
          </div>
        </Show>

        <Show when={tab() === "chat"}>
          <ChatPanel mimo={mimo} />
        </Show>
        <Show when={tab() === "sessions"}>
          <SessionsPanel mimo={mimo} />
        </Show>
        <Show when={tab() === "agents"}>
          <AgentsPanel mimo={mimo} />
        </Show>
        <Show when={tab() === "mcp"}>
          <McpPanel mimo={mimo} />
        </Show>
        <Show when={tab() === "models"}>
          <ModelsPanel mimo={mimo} />
        </Show>
        <Show when={tab() === "providers"}>
          <ProvidersPanel mimo={mimo} />
        </Show>
        <Show when={tab() === "stats"}>
          <StatsPanel mimo={mimo} />
        </Show>
        <Show when={tab() === "plugins"}>
          <PluginsPanel mimo={mimo} />
        </Show>
        <Show when={tab() === "debug"}>
          <DebugPanel mimo={mimo} />
        </Show>
        <Show when={tab() === "config"}>
          <ConfigPanel mimo={mimo} />
        </Show>
      </main>
    </div>
  );
}

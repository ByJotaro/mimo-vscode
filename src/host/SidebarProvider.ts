import * as vscode from 'vscode';
import {
  querySessionFromDb,
  listSessionsFromSqlite,
  pickHomeRecent,
  dbAvailable,
} from './db';
import { formatDbMessages, countToolMessages, formatPartForDisplay } from './format';
import { cssVariablesDark } from './theme/tokens';
import { mergeSessionMessagesById } from './session/merge';
import type { DisplayMessage } from './format/formatPart';
import { MimoClient, getWorkspaceRoot } from './cli/MimoClient';
import { getSlashCommandCatalog } from './cli/slashCatalog';

const HOME_RECENT_CAP = 6;
const FIRST_LOAD_LIMIT = 36;
const LOAD_MORE_STEP = 48;

/**
 * Thin host router: DB + format + CLI + postMessage.
 */
export class SidebarProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private currentSessionId = '';
  private selectionGen = 0;
  private readonly log: vscode.OutputChannel;
  private readonly client: MimoClient;
  private selectedMode = 'plan';
  private selectedModel = '';
  private modes: string[] = ['plan', 'build'];
  private models: Array<{ fullId: string; name?: string }> = [];
  private liveAssistantId = '';
  private liveBuffer = '';
  private sendInFlight = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext
  ) {
    this.log = vscode.window.createOutputChannel('MiMo Code v2');
    this.client = new MimoClient(getWorkspaceRoot(), (s) => this.log.appendLine(s));
    this.client.onEvent((ev) => this.onCliEvent(ev));
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _ctx: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;
    const webview = webviewView.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    webview.html = this.getHtml(webview);
    webview.onDidReceiveMessage((msg) => void this.onMessage(msg));
  }

  private post(msg: unknown): void {
    void this.view?.webview.postMessage(msg);
  }

  private async onMessage(msg: any): Promise<void> {
    if (!msg || typeof msg.type !== 'string') return;
    try {
      switch (msg.type) {
        case 'ready':
          await this.sendInit();
          break;
        case 'fetchSessions':
          await this.sendSessionsList(msg.history === true);
          break;
        case 'selectSession':
          if (typeof msg.sessionId === 'string' && msg.sessionId) {
            await this.selectSession(msg.sessionId);
          }
          break;
        case 'loadMoreSession':
          if (typeof msg.sessionId === 'string') {
            await this.loadMore(
              msg.sessionId,
              typeof msg.count === 'number' ? msg.count : undefined
            );
          }
          break;
        case 'newSession':
          await this.newSession();
          break;
        case 'goHome':
          this.currentSessionId = '';
          await this.sendInit();
          break;
        case 'sendPrompt':
          await this.sendPrompt(
            String(msg.text || ''),
            typeof msg.sessionId === 'string' ? msg.sessionId : undefined,
            typeof msg.mode === 'string' ? msg.mode : undefined,
            typeof msg.model === 'string' ? msg.model : undefined
          );
          break;
        case 'setMode':
          if (typeof msg.mode === 'string' && msg.mode) {
            this.selectedMode = msg.mode;
            void this.context.globalState.update('mimo.mode', msg.mode);
          }
          break;
        case 'setModel':
          if (typeof msg.model === 'string' && msg.model) {
            this.selectedModel = msg.model;
            void this.context.globalState.update('mimo.model', msg.model);
          }
          break;
        case 'abort':
          if (this.currentSessionId) void this.client.abort(this.currentSessionId);
          this.sendInFlight = false;
          this.post({ type: 'sendState', busy: false });
          break;
        case 'permissionReply':
          if (typeof msg.sessionId === 'string' && typeof msg.permissionId === 'string') {
            const resp = msg.response === 'always' || msg.response === 'reject' ? msg.response : 'once';
            await this.client.respondPermission(msg.sessionId, msg.permissionId, resp);
            this.post({ type: 'permissionCleared', permissionId: msg.permissionId });
          }
          break;
        case 'questionReply':
          if (typeof msg.sessionId === 'string' && typeof msg.callId === 'string') {
            const answers = Array.isArray(msg.answers) ? msg.answers : [msg.answer || msg.value || ''];
            await this.client.respondQuestion(
              msg.sessionId,
              msg.callId,
              answers,
              typeof msg.requestId === 'string' ? msg.requestId : undefined
            );
            this.post({ type: 'questionCleared', callId: msg.callId });
          }
          break;
        case 'ui-debug':
          if (Array.isArray(msg.payload)) {
            this.log.appendLine(msg.payload.map(String).join(' '));
          }
          break;
        default:
          this.log.appendLine(`[host] unknown msg ${msg.type}`);
      }
    } catch (e) {
      this.log.appendLine(`[host] ERR ${String(e)}`);
      this.post({ type: 'error', error: String(e).slice(0, 300) });
    }
  }

  private async sendInit(): Promise<void> {
    const t0 = Date.now();
    // Home always clears active session so webview shows logo + recent
    this.currentSessionId = '';
    const raw = dbAvailable() ? listSessionsFromSqlite(12) : [];
    const sessions = pickHomeRecent(raw, HOME_RECENT_CAP);
    const storedMode = this.context.globalState.get<string>('mimo.mode');
    const storedModel = this.context.globalState.get<string>('mimo.model');
    if (storedMode) this.selectedMode = storedMode;
    if (storedModel) this.selectedModel = storedModel;

    this.post({
      type: 'init',
      sessions,
      models: this.models,
      modes: this.modes,
      selectedModel: this.selectedModel,
      selectedMode: this.selectedMode,
      showStartupChooser: true,
      slashCommands: getSlashCommandCatalog(),
    });
    this.log.appendLine(
      `[INIT] sessions=${sessions.length} ms=${Date.now() - t0} db=${dbAvailable()}`
    );

    // Background: warm serve + models (never block Recent)
    void (async () => {
      try {
        this.client.setWorkspaceRoot(getWorkspaceRoot());
        await this.client.ensureServer();
        const [models, agents] = await Promise.all([
          this.client.listModels(),
          this.client.listAgents(),
        ]);
        if (models.length) {
          this.models = models;
          if (!this.selectedModel) this.selectedModel = models[0].fullId;
        }
        const modeIds = agents
          .filter((a) => a.id && !a.hidden)
          .map((a) => a.id)
          .filter(Boolean);
        if (modeIds.length) {
          this.modes = ['plan', 'build', ...modeIds].filter(
            (v, i, a) => a.indexOf(v) === i
          );
        }
        this.post({
          type: 'init',
          sessions,
          models: this.models,
          modes: this.modes,
          selectedModel: this.selectedModel,
          selectedMode: this.selectedMode,
          showStartupChooser: !this.currentSessionId,
          metadataOnly: true,
          slashCommands: getSlashCommandCatalog(),
        });
        this.log.appendLine(
          `[INIT_BG] models=${this.models.length} modes=${this.modes.length}`
        );
      } catch (e) {
        this.log.appendLine(`[INIT_BG_FAIL] ${String(e).slice(0, 120)}`);
      }
    })();
  }

  private async sendSessionsList(historyPanel = false): Promise<void> {
    // History: larger window + forks; home: roots only, Recent ≤6
    const fetchCap = historyPanel ? 100 : 12;
    const raw = dbAvailable()
      ? listSessionsFromSqlite(fetchCap, { includeForks: historyPanel })
      : [];
    const sessions = historyPanel
      ? pickHomeRecent(raw, 80)
      : pickHomeRecent(raw, HOME_RECENT_CAP);
    this.log.appendLine(
      `[SESSIONS] history=${historyPanel} raw=${raw.length} out=${sessions.length}`
    );
    this.post({ type: 'sessionsList', sessions, historyPanel });
  }

  private async newSession(): Promise<void> {
    try {
      await this.client.ensureServer();
      const s = await this.client.createSession();
      this.currentSessionId = s.id;
      this.post({
        type: 'sessionData',
        sessionId: s.id,
        title: 'New session',
        messages: [],
        meta: {
          source: 'new',
          pinBottom: true,
          olderCount: 0,
          totalMessages: 0,
          loadedCount: 0,
        },
      });
      this.log.appendLine(`[NEW_SESSION] ${s.id}`);
    } catch (e) {
      this.post({ type: 'error', error: `newSession: ${String(e).slice(0, 200)}` });
      // still show home
      this.currentSessionId = '';
      await this.sendInit();
    }
  }

  private async selectSession(sessionId: string): Promise<void> {
    const gen = ++this.selectionGen;
    this.currentSessionId = sessionId;
    this.post({ type: 'sessionLoadStatus', sessionId, loading: true });

    try {
      if (!dbAvailable()) {
        this.post({
          type: 'sessionLoadFailed',
          sessionId,
          error: 'mimocode.db / sqlite3 not found',
        });
        return;
      }
      const t0 = Date.now();
      const dbData = querySessionFromDb(sessionId, FIRST_LOAD_LIMIT);
      if (gen !== this.selectionGen) return;
      let messages: DisplayMessage[] = formatDbMessages(dbData.messages as any);
      messages = mergeSessionMessagesById(messages, []);
      const toolMsgs = countToolMessages(messages);
      this.post({
        type: 'sessionData',
        sessionId,
        title: dbData.session.title || sessionId,
        messages,
        meta: {
          source: 'db',
          pinBottom: true,
          hasToolCards: toolMsgs > 0,
          toolMsgs,
          limit: FIRST_LOAD_LIMIT,
          olderCount: dbData.meta.olderCount,
          totalMessages: dbData.meta.totalMessages,
          loadedCount: messages.length,
          loadMs: Date.now() - t0,
        },
      });
      this.log.appendLine(
        `[SELECT] ${sessionId} msgs=${messages.length} tools=${toolMsgs} older=${dbData.meta.olderCount} dbMs=${dbData.meta.ms}`
      );
      // warm serve for live follow
      void this.client.ensureServer().catch(() => undefined);
    } catch (e) {
      this.post({
        type: 'sessionLoadFailed',
        sessionId,
        error: String(e).slice(0, 200),
      });
    }
  }

  private async loadMore(sessionId: string, count?: number): Promise<void> {
    const want = Math.min(
      400,
      Math.max(FIRST_LOAD_LIMIT + LOAD_MORE_STEP, count || FIRST_LOAD_LIMIT + LOAD_MORE_STEP)
    );
    this.post({
      type: 'sessionLoadMoreStatus',
      sessionId,
      loading: true,
      limit: want,
    });
    try {
      const dbData = querySessionFromDb(sessionId, want);
      const messages = formatDbMessages(dbData.messages as any);
      const toolMsgs = countToolMessages(messages);
      this.post({
        type: 'sessionData',
        sessionId,
        title: dbData.session.title || sessionId,
        messages,
        meta: {
          source: 'loadMore',
          loadMore: true,
          pinBottom: false,
          hasToolCards: toolMsgs > 0,
          toolMsgs,
          limit: want,
          olderCount: dbData.meta.olderCount,
          totalMessages: dbData.meta.totalMessages,
          loadedCount: messages.length,
        },
      });
      this.post({
        type: 'sessionLoadMoreStatus',
        sessionId,
        loading: false,
        count: messages.length,
        olderCount: dbData.meta.olderCount,
      });
    } catch (e) {
      this.post({
        type: 'sessionLoadMoreStatus',
        sessionId,
        loading: false,
        error: String(e).slice(0, 120),
      });
    }
  }

  private async sendPrompt(
    text: string,
    sessionId?: string,
    mode?: string,
    model?: string
  ): Promise<void> {
    const prompt = text.trim();
    if (!prompt) return;
    if (this.sendInFlight) {
      this.post({ type: 'error', error: 'Wait for previous response' });
      return;
    }
    let sid = sessionId || this.currentSessionId;
    this.sendInFlight = true;
    this.liveBuffer = '';
    this.liveAssistantId = `live_${Date.now()}`;
    this.post({ type: 'sendState', busy: true });

    try {
      await this.client.ensureServer();
      if (!sid) {
        const s = await this.client.createSession();
        sid = s.id;
        this.currentSessionId = sid;
        this.post({
          type: 'sessionData',
          sessionId: sid,
          title: prompt.slice(0, 48),
          messages: [],
          meta: { source: 'new', pinBottom: true },
        });
      }
      this.currentSessionId = sid;

      // optimistic user bubble
      this.post({
        type: 'appendMessage',
        sessionId: sid,
        message: {
          id: `user_${Date.now()}`,
          role: 'user',
          text: prompt,
        },
      });
      this.post({
        type: 'appendMessage',
        sessionId: sid,
        message: {
          id: this.liveAssistantId,
          role: 'assistant',
          text: '',
          meta: { streaming: true },
        },
      });

      await this.client.promptAsync(sid, prompt, {
        mode: mode || this.selectedMode,
        model: model || this.selectedModel || undefined,
      });
      this.log.appendLine(`[PROMPT] session=${sid} len=${prompt.length}`);
    } catch (e) {
      this.sendInFlight = false;
      this.post({ type: 'sendState', busy: false });
      this.post({ type: 'error', error: String(e).slice(0, 300) });
    }
  }

  private onCliEvent(ev: {
    type: string;
    text?: string;
    part?: any;
    sessionId?: string;
    messageId?: string;
    error?: string;
    status?: string;
  }): void {
    const sid = ev.sessionId || this.currentSessionId;
    if (ev.type === 'text' && typeof ev.text === 'string') {
      if (sid && this.currentSessionId && sid !== this.currentSessionId) return;
      // delta or full — append if short delta
      if (ev.text.length < 500 && this.liveBuffer && !ev.text.startsWith(this.liveBuffer)) {
        this.liveBuffer += ev.text;
      } else if (ev.text.length >= this.liveBuffer.length) {
        this.liveBuffer = ev.text;
      } else {
        this.liveBuffer += ev.text;
      }
      this.post({
        type: 'streamUpdate',
        sessionId: sid,
        messageId: this.liveAssistantId || ev.messageId,
        text: this.liveBuffer,
      });
      return;
    }
    if (ev.type === 'part' && ev.part) {
      if (sid && this.currentSessionId && sid !== this.currentSessionId) return;
      // Mid-turn: tool/thinking cards stream into the live assistant bubble immediately
      const card = formatPartForDisplay(ev.part);
      if (card) {
        // Prefer append with separators so consecutive tools stay distinct
        const sep = this.liveBuffer && !this.liveBuffer.endsWith('\n') ? '\n' : '';
        this.liveBuffer += sep + card;
        this.post({
          type: 'streamUpdate',
          sessionId: sid,
          messageId: this.liveAssistantId || ev.messageId,
          text: this.liveBuffer,
        });
      }
      return;
    }
    if (ev.type === 'done') {
      this.sendInFlight = false;
      this.post({ type: 'sendState', busy: false });
      this.post({
        type: 'streamDone',
        sessionId: sid,
        messageId: this.liveAssistantId,
        text: this.liveBuffer,
      });
      // refresh from DB for full tool fidelity
      if (sid) {
        setTimeout(() => {
          if (this.currentSessionId === sid) void this.selectSession(sid);
        }, 800);
      }
      return;
    }
    if (ev.type === 'error') {
      this.sendInFlight = false;
      this.post({ type: 'sendState', busy: false });
      this.post({ type: 'error', error: ev.error || 'error' });
      return;
    }
    if (ev.type === 'status') {
      this.post({ type: 'serverStatus', status: ev.status, detail: (ev as any).detail });
    }
    if (ev.type === 'permission') {
      this.post({
        type: 'permissionRequest',
        sessionId: (ev as any).sessionId || this.currentSessionId,
        permissionId: (ev as any).permissionId,
        permission: (ev as any).permission,
        patterns: (ev as any).patterns,
      });
    }
    if (ev.type === 'permissionReplied') {
      this.post({ type: 'permissionCleared', permissionId: (ev as any).permissionId });
    }
    if (ev.type === 'question') {
      this.post({
        type: 'questionOverlay',
        sessionId: (ev as any).sessionId || this.currentSessionId,
        callId: (ev as any).callId,
        requestId: (ev as any).requestId,
        title: (ev as any).title,
        prompt: (ev as any).prompt,
        options: (ev as any).options,
        questions: (ev as any).questions,
      });
    }
    if (ev.type === 'questionCleared') {
      this.post({ type: 'questionCleared', callId: (ev as any).callId });
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'app.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'app.css')
    );
    const densityUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'cli-density.css')
    );
    const starUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'starfield.css')
    );
    const sfx = (name: string) =>
      webview
        .asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'sfx', name))
        .toString();
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src ${webview.cspSource}`,
      `font-src ${webview.cspSource}`,
      `img-src ${webview.cspSource} data:`,
      `media-src ${webview.cspSource}`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${styleUri}" rel="stylesheet" />
  <link href="${densityUri}" rel="stylesheet" />
  <link href="${starUri}" rel="stylesheet" />
  <style>${cssVariablesDark()}</style>
  <title>MiMo Code</title>
</head>
<body>
  <div id="bg" class="bg" aria-hidden="true"><canvas class="bg__canvas" id="starfield"></canvas></div>
  <header class="session-header" id="header">
    <div class="session-title" id="session-title">MiMo Code</div>
    <div class="header-actions">
      <button type="button" id="btn-history-top" title="Session history">History</button>
      <button type="button" id="btn-home" title="Home">⌂</button>
      <button type="button" id="btn-abort" title="Abort" hidden>■</button>
    </div>
  </header>
  <main class="chat-area" id="chat"></main>
  <footer class="input-area">
    <div class="input-row">
      <textarea id="prompt" rows="2" placeholder="Ask anything…"></textarea>
      <button type="button" id="btn-send">→</button>
    </div>
    <div class="input-meta">
      <select id="mode-select" title="Mode"></select>
      <select id="model-select" title="Model"></select>
      <span class="muted" id="status-label">v2</span>
    </div>
  </footer>
  <script>
    window.__mimoSfx = {
      charge: ${JSON.stringify(sfx('charge.wav'))},
      pulseA: ${JSON.stringify(sfx('pulse-a.wav'))},
      pulseB: ${JSON.stringify(sfx('pulse-b.wav'))},
      pulseC: ${JSON.stringify(sfx('pulse-c.wav'))}
    };
  </script>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}

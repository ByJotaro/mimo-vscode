/**
 * Lean MiMo CLI client: spawn `mimo serve`, REST + SSE.
 * Does NOT kill user mimo processes — only tracks our own PID.
 */
import * as cp from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as http from 'http';
import * as net from 'net';
import * as path from 'path';
import * as vscode from 'vscode';
import { getMimoBin } from '../db/paths';

export type QuestionOption = { label: string; description?: string; value?: string };
export type QuestionItem = {
  title: string;
  prompt: string;
  options: QuestionOption[];
  multiple?: boolean;
};
export type ChatEvent =
  | { type: 'text'; text: string; messageId?: string; sessionId?: string }
  | { type: 'part'; part: any; messageId?: string; sessionId?: string }
  | { type: 'done'; sessionId?: string; messageId?: string }
  | { type: 'error'; error: string; sessionId?: string }
  | { type: 'status'; status: string; detail?: string }
  | { type: 'usage'; sessionId?: string; used?: number; size?: number; amount?: number }
  | { type: 'sessionTitle'; sessionId?: string; title: string }
  | {
      type: 'permission';
      sessionId?: string;
      permissionId: string;
      permission?: string;
      patterns?: string[];
    }
  | { type: 'permissionReplied'; sessionId?: string; permissionId: string }
  | {
      type: 'question';
      sessionId?: string;
      callId: string;
      requestId?: string;
      title: string;
      prompt: string;
      options: QuestionOption[];
      questions: QuestionItem[];
    }
  | { type: 'questionCleared'; sessionId?: string; callId?: string };

type ServerLock = {
  workspaceRoot: string;
  port: number;
  password: string;
  updatedAt: string;
};

const LOCK_DIR = '.mimocode';
const LOCK_FILE = 'vscode-server.lock';
const PORT_BASE = 42100;
const PORT_RANGE = 200;

export class MimoClient {
  private baseUrl?: string;
  private password = '';
  private port?: number;
  private ourPid?: number;
  private process?: cp.ChildProcess;
  private eventAbort?: AbortController;
  private eventActive = false;
  private listeners = new Set<(e: ChatEvent) => void>();
  private workspaceRoot: string;
  private log: (s: string) => void;

  constructor(workspaceRoot: string, log?: (s: string) => void) {
    this.workspaceRoot = workspaceRoot || process.cwd();
    this.log = log || ((s) => console.log(s));
  }

  setWorkspaceRoot(root: string): void {
    if (root && root !== this.workspaceRoot) {
      this.workspaceRoot = root;
    }
  }

  onEvent(fn: (e: ChatEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: ChatEvent): void {
    for (const fn of this.listeners) {
      try {
        fn(e);
      } catch {
        /* ignore */
      }
    }
  }

  private hashRoot(root: string): number {
    let h = 0;
    const n = root.replace(/\\/g, '/').toLowerCase();
    for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
    return h;
  }

  private defaultPort(): number {
    return PORT_BASE + (this.hashRoot(this.workspaceRoot) % PORT_RANGE);
  }

  private lockPath(): string {
    return path.join(this.workspaceRoot, LOCK_DIR, LOCK_FILE);
  }

  private authHeader(): string {
    if (!this.password) return '';
    return 'Basic ' + Buffer.from('opencode:' + this.password).toString('base64');
  }

  private async readLock(): Promise<ServerLock | null> {
    try {
      const raw = await fs.promises.readFile(this.lockPath(), 'utf-8');
      const p = JSON.parse(raw);
      if (!p || typeof p.port !== 'number') return null;
      return {
        workspaceRoot: p.workspaceRoot || this.workspaceRoot,
        port: p.port,
        password: typeof p.password === 'string' ? p.password : '',
        updatedAt: p.updatedAt || new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }

  private async writeLock(lock: ServerLock): Promise<void> {
    const dir = path.dirname(this.lockPath());
    await fs.promises.mkdir(dir, { recursive: true });
    const tmp = this.lockPath() + '.tmp';
    await fs.promises.writeFile(tmp, JSON.stringify(lock, null, 2), 'utf-8');
    await fs.promises.rename(tmp, this.lockPath());
  }

  private health(port: number, password: string, timeoutMs = 1500): Promise<'ok' | 'unauthorized' | 'down'> {
    return new Promise((resolve) => {
      const headers: Record<string, string> = {};
      if (password) {
        headers.Authorization =
          'Basic ' + Buffer.from('opencode:' + password).toString('base64');
      }
      const req = http.get(
        { host: '127.0.0.1', port, path: '/global/health', headers, timeout: timeoutMs },
        (res) => {
          res.resume();
          if (res.statusCode === 200) resolve('ok');
          else if (res.statusCode === 401) resolve('unauthorized');
          else resolve('down');
        }
      );
      req.on('error', () => resolve('down'));
      req.on('timeout', () => {
        req.destroy();
        resolve('down');
      });
    });
  }

  private findFreePort(start: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const tryPort = (p: number, left: number) => {
        if (left <= 0) return reject(new Error('no free port'));
        const srv = net.createServer();
        srv.unref();
        srv.on('error', () => tryPort(p + 1, left - 1));
        srv.listen(p, '127.0.0.1', () => {
          const addr = srv.address();
          const port = typeof addr === 'object' && addr ? addr.port : p;
          srv.close(() => resolve(port));
        });
      };
      tryPort(start, 40);
    });
  }

  async ensureServer(): Promise<void> {
    if (this.baseUrl) {
      const h = await this.health(this.port!, this.password);
      if (h === 'ok') return;
      this.baseUrl = undefined;
    }

    // Reuse existing lock if healthy
    const existing = await this.readLock();
    if (existing) {
      const h = await this.health(existing.port, existing.password);
      if (h === 'ok') {
        this.port = existing.port;
        this.password = existing.password;
        this.baseUrl = `http://127.0.0.1:${existing.port}`;
        this.log(`[cli] reuse serve port=${existing.port}`);
        this.connectEvents();
        this.emit({ type: 'status', status: 'connected', detail: `reuse:${existing.port}` });
        return;
      }
    }

    // Also scan common open serve (no auth) — don't kill, just use
    for (const p of [existing?.port, this.defaultPort(), 42186, 4096].filter(Boolean) as number[]) {
      const h = await this.health(p, '');
      if (h === 'ok') {
        this.port = p;
        this.password = '';
        this.baseUrl = `http://127.0.0.1:${p}`;
        this.log(`[cli] adopt open serve port=${p}`);
        this.connectEvents();
        this.emit({ type: 'status', status: 'connected', detail: `adopt:${p}` });
        return;
      }
    }

    const password = crypto.randomBytes(24).toString('base64url');
    const port = await this.findFreePort(this.defaultPort());
    const lock: ServerLock = {
      workspaceRoot: this.workspaceRoot,
      port,
      password,
      updatedAt: new Date().toISOString(),
    };
    await this.writeLock(lock);

    const bin = getMimoBin();
    this.log(`[cli] spawn serve port=${port} bin=${bin}`);
    const child = cp.spawn(bin, ['serve', '--port', String(port), '--hostname', '127.0.0.1'], {
      cwd: this.workspaceRoot,
      windowsHide: true,
      env: {
        ...process.env,
        OPENCODE_SERVER_PASSWORD: password,
        PYTHONIOENCODING: 'utf-8',
      },
      stdio: 'ignore',
    });
    this.process = child;
    this.ourPid = child.pid;
    child.on('exit', (code) => {
      this.log(`[cli] serve exit code=${code} pid=${child.pid}`);
      if (this.ourPid === child.pid) {
        this.ourPid = undefined;
        this.process = undefined;
        this.baseUrl = undefined;
      }
    });

    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
      const h = await this.health(port, password, 800);
      if (h === 'ok') {
        this.port = port;
        this.password = password;
        this.baseUrl = `http://127.0.0.1:${port}`;
        this.connectEvents();
        this.emit({ type: 'status', status: 'connected', detail: `spawn:${port}` });
        return;
      }
      // try without auth (some builds ignore password on loopback)
      const h2 = await this.health(port, '', 800);
      if (h2 === 'ok') {
        this.port = port;
        this.password = '';
        this.baseUrl = `http://127.0.0.1:${port}`;
        this.connectEvents();
        this.emit({ type: 'status', status: 'connected', detail: `spawn-noauth:${port}` });
        return;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error(`mimo serve failed to become healthy on ${port}`);
  }

  private async request(
    method: string,
    reqPath: string,
    body?: unknown,
    timeoutMs = 30000
  ): Promise<any> {
    await this.ensureServer();
    const url = new URL(reqPath, this.baseUrl!).toString();
    const headers: Record<string, string> = { Accept: 'application/json' };
    const auth = this.authHeader();
    if (auth) headers.Authorization = auth;
    let payload: string | undefined;
    if (body !== undefined) {
      payload = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(url, {
      method,
      headers,
      body: payload,
      signal: AbortSignal.timeout(timeoutMs),
    } as any);
    const text = await res.text();
    if (res.status >= 400) {
      throw new Error(`${method} ${reqPath} → ${res.status}: ${text.slice(0, 200)}`);
    }
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async createSession(): Promise<{ id: string }> {
    const s = await this.request('POST', '/session', {});
    if (!s?.id) throw new Error('createSession: no id');
    return { id: s.id };
  }

  async listModels(): Promise<Array<{ fullId: string; name?: string; providerId?: string }>> {
    try {
      const data = await this.request('GET', '/config/providers', undefined, 10000);
      // providers shape varies — normalize
      const out: Array<{ fullId: string; name?: string; providerId?: string }> = [];
      const providers = Array.isArray(data) ? data : data?.providers || data?.all || [];
      for (const p of providers) {
        const pid = p.id || p.providerID || p.providerId || '';
        const models = p.models || p.model || [];
        const list = Array.isArray(models)
          ? models
          : typeof models === 'object'
            ? Object.keys(models).map((k) => ({ id: k, ...(models as any)[k] }))
            : [];
        for (const m of list) {
          const mid = typeof m === 'string' ? m : m.id || m.modelID || '';
          if (!mid) continue;
          const fullId = mid.includes('/') ? mid : pid ? `${pid}/${mid}` : mid;
          out.push({
            fullId,
            name: typeof m === 'object' ? m.name || mid : mid,
            providerId: pid,
          });
        }
      }
      return out;
    } catch (e) {
      this.log(`[cli] listModels fail ${String(e).slice(0, 80)}`);
      return [];
    }
  }

  async listAgents(): Promise<Array<{ id: string; mode?: string; hidden?: boolean }>> {
    try {
      const data = await this.request('GET', '/agent', undefined, 8000);
      const arr = Array.isArray(data) ? data : data?.agents || [];
      return arr.map((a: any) => ({
        id: a.id || a.name,
        mode: a.mode,
        hidden: Boolean(a.hidden),
      }));
    } catch {
      return [
        { id: 'plan', mode: 'primary' },
        { id: 'build', mode: 'primary' },
      ];
    }
  }

  async promptAsync(
    sessionId: string,
    text: string,
    options: { model?: string; mode?: string } = {}
  ): Promise<void> {
    const payload: any = {
      parts: [{ type: 'text', text }],
    };
    if (options.mode) payload.agent = options.mode;
    if (options.model) {
      const parts = options.model.split('/');
      if (parts.length >= 2) {
        payload.model = { providerID: parts[0], modelID: parts.slice(1).join('/') };
      }
    }
    await this.request('POST', `/session/${encodeURIComponent(sessionId)}/prompt_async`, payload, 60000);
  }

  async abort(sessionId: string): Promise<void> {
    try {
      await this.request('POST', `/session/${encodeURIComponent(sessionId)}/abort`, {}, 5000);
    } catch {
      /* ignore */
    }
  }

  async respondPermission(
    sessionId: string,
    permissionId: string,
    response: 'once' | 'always' | 'reject'
  ): Promise<void> {
    const body = { response };
    try {
      await this.request(
        'POST',
        `/session/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(permissionId)}`,
        body,
        8000
      );
      return;
    } catch {
      /* fall through */
    }
    await this.request(
      'POST',
      `/permission/${encodeURIComponent(permissionId)}/reply?directory=${encodeURIComponent(this.workspaceRoot)}`,
      { reply: response },
      8000
    );
  }

  private connectEvents(): void {
    if (this.eventActive || !this.baseUrl) return;
    this.eventActive = true;
    this.eventAbort?.abort();
    this.eventAbort = new AbortController();
    const signal = this.eventAbort.signal;
    const run = async () => {
      try {
        const headers: Record<string, string> = { Accept: 'text/event-stream' };
        const auth = this.authHeader();
        if (auth) headers.Authorization = auth;
        const res = await fetch(`${this.baseUrl}/event`, { headers, signal } as any);
        if (!res.ok || !res.body) throw new Error(`event ${res.status}`);
        const reader = (res.body as any).getReader();
        const dec = new TextDecoder('utf-8');
        let buf = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split(/\r?\n/);
          buf = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            this.handleSse(payload);
          }
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        this.log(`[cli] event err ${String(e).slice(0, 100)}`);
      } finally {
        this.eventActive = false;
        if (!signal.aborted) {
          setTimeout(() => this.connectEvents(), 1500);
        }
      }
    };
    void run();
  }

  private handleSse(payload: string): void {
    try {
      const ev = JSON.parse(payload);
      const type = ev.type || ev.event || '';
      const props = ev.properties || ev.data || ev;
      const sessionId = props.sessionID || props.sessionId || props.session_id;
      const messageId = props.messageID || props.messageId || props.message_id || props.id;

      if (/message\.part|part\.updated|part\.delta/i.test(type)) {
        const part = props.part || props;
        const q = this.extractQuestion(part);
        if (q) {
          this.emit({ type: 'question', sessionId, ...q });
          return;
        }
        if (part?.type === 'text' || typeof part?.text === 'string') {
          this.emit({
            type: 'text',
            text: String(part.text || props.delta || props.text || ''),
            messageId,
            sessionId,
          });
        } else {
          this.emit({ type: 'part', part, messageId, sessionId });
        }
        return;
      }
      if (/message\.updated|assistant\.message/i.test(type)) {
        const text = props.message?.parts
          ? props.message.parts
              .filter((p: any) => p.type === 'text')
              .map((p: any) => p.text)
              .join('')
          : props.text;
        if (text) this.emit({ type: 'text', text: String(text), messageId, sessionId });
        return;
      }
      if (/session\.updated|session\.title|session\.renamed/i.test(type)) {
        const title = String(
          props.title || props.name || props.session?.title || props.info?.title || ''
        ).trim();
        if (title && sessionId) this.emit({ type: 'sessionTitle', sessionId, title });
        // fall through — may also carry status
      }
      if (/session\.idle|session\.status|turn\.complete|message\.complete/i.test(type)) {
        const st = props.type || props.status || type;
        if (/idle|complete|done/i.test(String(st))) {
          this.emit({ type: 'done', sessionId, messageId });
        }
        return;
      }
      if (/session\.usage|usage\.updated|message\.usage/i.test(type) || props.tokens || props.usage) {
        const u = props.usage || props.tokens || props;
        const used = Number(u.used ?? u.input ?? u.total ?? u.prompt ?? 0) || undefined;
        const size = Number(u.size ?? u.context ?? u.limit ?? 0) || undefined;
        const amount = Number(u.amount ?? u.cost ?? u.totalCost ?? 0) || undefined;
        if (used || size || amount) {
          this.emit({ type: 'usage', sessionId, used, size, amount });
        }
        return;
      }
      if (type === 'permission.asked' || /permission\.asked/i.test(type)) {
        const permissionId = String(props.id || props.permissionId || props.requestID || '');
        if (permissionId) {
          this.emit({
            type: 'permission',
            sessionId,
            permissionId,
            permission: typeof props.permission === 'string' ? props.permission : undefined,
            patterns: Array.isArray(props.patterns)
              ? props.patterns.filter((x: any) => typeof x === 'string')
              : undefined,
          });
        }
        return;
      }
      if (type === 'permission.replied' || /permission\.replied/i.test(type)) {
        const permissionId = String(props.requestID || props.permissionId || props.id || '');
        if (permissionId) {
          this.emit({ type: 'permissionReplied', sessionId, permissionId });
        }
        return;
      }
      if (type === 'question.asked' || /question\.asked/i.test(type)) {
        const q = this.extractQuestion(props);
        if (q) this.emit({ type: 'question', sessionId, ...q });
        return;
      }
      if (type === 'question.replied' || /question\.replied|question\.cleared/i.test(type)) {
        this.emit({
          type: 'questionCleared',
          sessionId,
          callId: String(props.callId || props.callID || props.id || ''),
        });
        return;
      }
      if (/error/i.test(type)) {
        this.emit({ type: 'error', error: String(props.message || props.error || type), sessionId });
      }
    } catch {
      /* ignore non-json */
    }
  }

  private extractQuestion(part: any): {
    callId: string;
    requestId?: string;
    title: string;
    prompt: string;
    options: QuestionOption[];
    questions: QuestionItem[];
  } | null {
    if (!part || typeof part !== 'object') return null;
    const toolName =
      (typeof part.toolName === 'string' && part.toolName) ||
      (typeof part.tool === 'string' && part.tool) ||
      (typeof part.name === 'string' && part.name) ||
      '';
    const looksQuestion =
      toolName === 'question' ||
      part.type === 'question' ||
      Array.isArray(part.questions) ||
      part.question;
    if (!looksQuestion) return null;
    const status = part.status ?? part.state?.status ?? part.state;
    if (status && status !== 'running' && status !== 'pending') return null;

    const callId = String(
      part.callID || part.callId || part.id || part.tool?.callID || part.tool?.callId || ''
    );
    if (!callId && !part.questions && !part.question) return null;

    const input = part.state?.input ?? part.input ?? part;
    const candidates = Array.isArray(input?.questions)
      ? input.questions
      : input?.question
        ? [input.question]
        : Array.isArray(part.questions)
          ? part.questions
          : part.question
            ? [part.question]
            : [];

    const normOpt = (raw: any): QuestionOption[] => {
      if (!Array.isArray(raw)) return [];
      return raw
        .map((o) => {
          if (typeof o === 'string') return { label: o, value: o };
          if (!o || typeof o !== 'object') return null;
          const label = String(o.label || o.name || o.title || o.value || '').trim();
          if (!label) return null;
          return {
            label,
            description: o.description ? String(o.description) : undefined,
            value: String(o.value ?? o.id ?? label),
          };
        })
        .filter(Boolean) as QuestionOption[];
    };

    const questions: QuestionItem[] = [];
    for (const q of candidates) {
      const title = String(q?.title ?? q?.header ?? q?.name ?? q?.label ?? '').trim();
      const prompt = String(
        q?.prompt ?? q?.question ?? q?.text ?? q?.description ?? ''
      ).trim();
      const options = normOpt(q?.options ?? q?.choices);
      if (!prompt && !title) continue;
      questions.push({
        title: title || 'Question',
        prompt: prompt || title || 'Choose',
        options: options.length ? options : [{ label: 'OK', value: 'ok' }],
        multiple: q?.multiple === true,
      });
    }
    if (!questions.length) {
      const title = String(part.header ?? part.title ?? 'Question').trim();
      const prompt = String(part.questionText ?? part.prompt ?? part.text ?? '').trim();
      const options = normOpt(input?.options ?? input?.choices ?? part.options ?? part.choices);
      if (!prompt && !options.length) return null;
      questions.push({
        title,
        prompt: prompt || title,
        options: options.length ? options : [{ label: 'OK', value: 'ok' }],
      });
    }
    const first = questions[0];
    return {
      callId: callId || `q_${Date.now()}`,
      requestId: String(
        part.requestID || part.requestId || part.tool?.requestID || part.id || ''
      ) || undefined,
      title: first.title,
      prompt: first.prompt,
      options: first.options,
      questions,
    };
  }

  /** Reply to interactive question tool */
  async respondQuestion(
    sessionId: string,
    callId: string,
    answers: Array<{ label?: string; value?: string } | string>,
    requestId?: string
  ): Promise<void> {
    await this.ensureServer();
    const body = {
      answers: answers.map((a) =>
        typeof a === 'string' ? { value: a, label: a } : a
      ),
      callID: callId,
      callId,
    };
    const rid = requestId || callId;
    try {
      await this.request(
        'POST',
        `/question/${encodeURIComponent(rid)}/reply?directory=${encodeURIComponent(this.workspaceRoot)}`,
        body
      );
      return;
    } catch {
      /* fallback */
    }
    await this.request(
      'POST',
      `/session/${encodeURIComponent(sessionId)}/question/${encodeURIComponent(rid)}/reply`,
      body
    );
  }


  async fetchSessionUsage(sessionId: string): Promise<{ used: number; size: number; amount: number } | null> {
    try {
      const data = await this.request('GET', /session/ + encodeURIComponent(sessionId), undefined, 8000);
      const u = data?.tokens || data?.usage || data?.info?.tokens || data;
      if (!u || typeof u !== 'object') return null;
      return {
        used: Number(u.total || u.used || (Number(u.input||0)+Number(u.output||0)) || 0) || 0,
        size: Number(u.context || u.size || u.limit || 0) || 0,
        amount: Number(u.cost || u.amount || 0) || 0,
      };
    } catch {
      return null;
    }
  }
  /** Dispose only our spawned process — never blanket-kill mimo. */
  dispose(): void {
    this.eventAbort?.abort();
    this.eventActive = false;
    if (this.process && this.ourPid && this.process.pid === this.ourPid) {
      try {
        if (process.platform === 'win32') {
          cp.spawnSync('taskkill', ['/PID', String(this.ourPid), '/T', '/F'], {
            windowsHide: true,
          });
        } else {
          this.process.kill('SIGTERM');
        }
      } catch {
        /* */
      }
    }
    this.process = undefined;
    this.ourPid = undefined;
    this.baseUrl = undefined;
  }
}

export function getWorkspaceRoot(): string {
  return (
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ||
    process.env.USERPROFILE ||
    process.cwd()
  );
}

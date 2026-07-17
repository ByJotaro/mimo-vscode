import { spawn, type ChildProcess } from "child_process";
import { findMimoBin } from "./mimoBin";
import * as vscode from "vscode";
import type { Session } from "./shared/messages";

const SERVE_PORT_RE = /listening on (https?:\/\/127\.0\.0\.1:(\d+))/;

export interface RunEvents {
  onText: (text: string, messageId: string) => void;
  onDone: (messageId: string) => void;
  onError: (err: string) => void;
}

/**
 * Owns the long-lived `mimo serve` subprocess (for reading sessions/messages)
 * and runs short-lived `mimo run` subprocesses to send prompts.
 */
export class MimoService {
  private server?: ChildProcess;
  private serverUrl?: string;
  private _ready = false;
  private readyWaiters: Array<(url: string) => void> = [];
  private logger?: vscode.LogOutputChannel;
  private activeSessionId?: string;

  setLogger(log: vscode.LogOutputChannel) {
    this.logger = log;
  }

  private log(msg: string, ...args: unknown[]) {
    this.logger?.info(`[MimoService] ${msg}`, ...args);
  }

  get isReady() {
    return this._ready;
  }

  getServerUrl() {
    return this.serverUrl;
  }

  getActiveSessionId() {
    return this.activeSessionId;
  }

  setActiveSessionId(id: string | undefined) {
    this.activeSessionId = id;
  }

  /** Spawn `mimo serve`, wait until it prints the listening URL. */
  async initialize(): Promise<string> {
    if (this._ready && this.serverUrl) return this.serverUrl;

    const bin = findMimoBin();
    if (!bin) {
      throw new Error(
        "mimo CLI not found. Install it (npm i -g @mimo-ai/cli) and restart VS Code.",
      );
    }
    this.log(`using mimo bin: ${bin}`);

    const nodeBin = process.execPath;
    const proc = spawn(nodeBin, [bin, "serve", "--port", "0", "--hostname", "127.0.0.1"], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    this.server = proc;

    const ready = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("mimo serve did not start within 15s"));
      }, 15000);

      const onData = (chunk: Buffer) => {
        const text = chunk.toString();
        this.logger?.appendLine(text);
        const m = text.match(SERVE_PORT_RE);
        if (m) {
          this.serverUrl = m[1];
          this._ready = true;
          clearTimeout(timeout);
          proc.stdout?.removeListener("data", onData);
          resolve(this.serverUrl);
        }
      };
      proc.stdout?.on("data", onData);
      proc.stderr?.on("data", (c) => this.logger?.appendLine(c.toString()));

      proc.on("error", (e) => {
        clearTimeout(timeout);
        reject(e);
      });
      proc.on("exit", (code) => {
        if (!this._ready) {
          clearTimeout(timeout);
          reject(new Error(`mimo serve exited early with code ${code}`));
        }
      });
    });

    const url = await ready;
    this.readyWaiters.forEach((r) => r(url));
    this.readyWaiters = [];
    return url;
  }

  async whenReady(): Promise<string> {
    if (this._ready && this.serverUrl) return this.serverUrl;
    return new Promise<string>((resolve) => this.readyWaiters.push(resolve));
  }

  async getSessions(): Promise<Session[]> {
    const base = await this.whenReady();
    const res = await fetch(`${base}/session`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`GET /session failed: ${res.status}`);
    return (await res.json()) as Session[];
  }

  async getMessages(sessionId: string): Promise<unknown[]> {
    const base = await this.whenReady();
    const res = await fetch(`${base}/session/${encodeURIComponent(sessionId)}/message`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`GET /session/${sessionId}/message failed: ${res.status}`);
    return (await res.json()) as unknown[];
  }

  async createSession(): Promise<Session> {
    const base = await this.whenReady();
    const res = await fetch(`${base}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`POST /session failed: ${res.status}`);
    return (await res.json()) as Session;
  }

  /**
   * Send a prompt via `mimo run --format json`, streaming text deltas back through `events`.
   * Returns the new/child session id so the caller can continue the chain.
   */
  async sendPrompt(text: string, sessionId: string | undefined, events: RunEvents): Promise<string> {
    const bin = findMimoBin();
    if (!bin) throw new Error("mimo CLI not found");

    // --port 0 gives mimo run its OWN ephemeral port so it does not collide with / attach
    // to the long-lived `mimo serve` we keep for reading sessions. Without this, run attaches
    // to serve on 4096 and stops writing JSON events to stdout.
    const args = ["run", text, "--format", "json", "--port", "0"];
    if (sessionId) {
      args.push("--continue", "--session", sessionId);
    }

    const nodeBin = process.execPath;
    const proc = spawn(nodeBin, [bin, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let messageId = `msg_${Date.now()}`;
    let buffered = "";

    const flush = () => {
      if (!buffered) return;
      const line = buffered;
      buffered = "";
      try {
        const evt = JSON.parse(line);
        if (evt?.type === "text" && typeof evt.text === "string") {
          messageId = evt.messageID || messageId;
          events.onText(evt.text, messageId);
        } else if (evt?.type === "step_finish") {
          events.onDone(evt.messageID || messageId);
        }
      } catch {
        // ignore non-JSON lines (progress/ascii)
      }
    };

    return new Promise<string>((resolve, reject) => {
      proc.stdout?.on("data", (chunk: Buffer) => {
        buffered += chunk.toString();
        let idx: number;
        while ((idx = buffered.indexOf("\n")) >= 0) {
          const line = buffered.slice(0, idx).trim();
          buffered = buffered.slice(idx + 1);
          if (!line) continue;
          try {
            const evt = JSON.parse(line);
            if (evt?.type === "text" && typeof evt.text === "string") {
              messageId = evt.messageID || messageId;
              events.onText(evt.text, messageId);
            } else if (evt?.type === "step_finish") {
              events.onDone(evt.messageID || messageId);
            }
          } catch {
            // ignore non-JSON lines
          }
        }
      });

      proc.stderr?.on("data", (c) => this.logger?.appendLine(c.toString()));

      proc.on("error", (e) => {
        events.onError(e.message);
        reject(e);
      });

      proc.on("exit", (code) => {
        // flush any trailing line
        if (buffered.trim()) {
          try {
            const evt = JSON.parse(buffered.trim());
            if (evt?.type === "text" && typeof evt.text === "string")
              events.onText(evt.text, messageId);
            if (evt?.type === "step_finish") events.onDone(evt.messageID || messageId);
          } catch {
            /* ignore */
          }
        }
        if (code === 0 || code === null) {
          resolve(messageId);
        } else {
          events.onError(`mimo run exited with code ${code}`);
          reject(new Error(`mimo run exited with code ${code}`));
        }
      });
    });
  }

  // ---------- REST reads (mimo serve) ----------

  async getAgents(): Promise<unknown[]> {
    const base = await this.whenReady();
    const res = await fetch(`${base}/agent`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`GET /agent failed: ${res.status}`);
    return (await res.json()) as unknown[];
  }

  async getMcp(): Promise<Record<string, { status: string }>> {
    const base = await this.whenReady();
    const res = await fetch(`${base}/mcp`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`GET /mcp failed: ${res.status}`);
    return (await res.json()) as Record<string, { status: string }>;
  }

  async getConfig(): Promise<unknown> {
    const base = await this.whenReady();
    const res = await fetch(`${base}/config`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`GET /config failed: ${res.status}`);
    return (await res.json()) as unknown;
  }

  // ---------- Subprocess commands (mimo <cmd>) ----------

  /** Run a `mimo` CLI command and capture its stdout as text. */
  private runCli(args: string[], timeoutMs = 30000): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const bin = findMimoBin();
      if (!bin) return reject(new Error("mimo CLI not found"));
      const proc = spawn(process.execPath, [bin, ...args], {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      let out = "";
      let err = "";
      proc.stdout?.on("data", (d) => (out += d.toString()));
      proc.stderr?.on("data", (d) => (err += d.toString()));
      const timer = setTimeout(() => {
        proc.kill("SIGTERM");
        reject(new Error(`mimo ${args[0]} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      proc.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      proc.on("exit", (code) => {
        clearTimeout(timer);
        if (code === 0 || code === null) resolve(out);
        else reject(new Error(`mimo ${args[0]} exited ${code}: ${err.slice(0, 300)}`));
      });
    });
  }

  async getModels(verbose = true): Promise<string> {
    return this.runCli(verbose ? ["models", "--verbose"] : ["models"]);
  }

  async getProviders(): Promise<string> {
    return this.runCli(["providers", "list"]);
  }

  async getProvidersWhoami(): Promise<string> {
    return this.runCli(["providers", "whoami"]);
  }

  async getStats(days?: number): Promise<string> {
    const args = ["stats"];
    if (days) args.push("--days", String(days));
    return this.runCli(args, 20000);
  }

  async deleteSession(sessionId: string): Promise<string> {
    return this.runCli(["session", "delete", sessionId], 20000);
  }

  async exportSession(sessionId: string, sanitize = false): Promise<string> {
    const args = ["export", sessionId];
    if (sanitize) args.push("--sanitize");
    return this.runCli(args, 20000);
  }

  async importSession(fileOrUrl: string): Promise<string> {
    return this.runCli(["import", fileOrUrl], 30000);
  }

  async installPlugin(module: string, global = false, force = false): Promise<string> {
    const args = ["plugin", module];
    if (global) args.push("--global");
    if (force) args.push("--force");
    return this.runCli(args, 60000);
  }

  async debugCommand(sub: string): Promise<string> {
    return this.runCli(["debug", sub], 20000);
  }

  async getVersion(): Promise<string> {
    return this.runCli(["--version"], 10000);
  }

  dispose() {
    if (this.server) {
      try {
        this.server.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      this.server = undefined;
    }
    this._ready = false;
    this.serverUrl = undefined;
  }
}

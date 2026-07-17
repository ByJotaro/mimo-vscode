// Thin wrapper around the VS Code webview API.

declare global {
  interface Window {
    acquireVsCodeApi?: () => VSCodeApi;
  }
}

interface VSCodeApi {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

let api: VSCodeApi | undefined;

export function getVSCode(): VSCodeApi {
  if (!api && window.acquireVsCodeApi) {
    api = window.acquireVsCodeApi();
  }
  // Fallback for running the webview standalone (e.g. vite dev server).
  return (
    api ?? {
      postMessage: (m) => console.log("[webview->host]", m),
      getState: () => undefined,
      setState: () => undefined,
    }
  );
}

export function postToHost(msg: unknown): void {
  getVSCode().postMessage(msg);
}

/** Subscribe to host messages; returns an unsubscribe fn. */
export function onHostMessage(handler: (msg: unknown) => void): () => void {
  const listener = (e: MessageEvent) => handler(e.data);
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}

import * as vscode from "vscode";
import { MimoService } from "./MimoService";
import { MimoViewProvider } from "./MimoViewProvider";

let logger: vscode.LogOutputChannel;

export function getLogger(): vscode.LogOutputChannel {
  return logger;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  logger = vscode.window.createOutputChannel("MiMo Code", { log: true });
  context.subscriptions.push(logger);

  logger.info("MiMo Code extension activated");

  const service = new MimoService();
  service.setLogger(logger);

  // Start the mimo serve server in the background.
  service
    .initialize()
    .then((url) => logger.info(`mimo serve started at ${url}`))
    .catch((e) => logger.error("Failed to start mimo serve", e));

  const provider = new MimoViewProvider(context.extensionUri, service);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(MimoViewProvider.viewType, provider),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("mimo.addSelectionToPrompt", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage("MiMo Code: no active editor selection.");
        return;
      }
      const doc = editor.document;
      const filePath = vscode.workspace.asRelativePath(doc.uri);
      const fileUrl = doc.uri.toString();
      const sel = editor.selection;
      const message = {
        type: "editor-selection",
        filePath,
        fileUrl,
        selection: sel.isEmpty
          ? undefined
          : { startLine: sel.start.line + 1, endLine: sel.end.line + 1 },
      };
      await vscode.commands.executeCommand("workbench.view.extension.mimo");
      provider.postToWebview(message as any);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("mimo.newSession", () => {
      service.setActiveSessionId(undefined);
      provider.postToWebview({ type: "newSession" } as any);
    }),
  );

  context.subscriptions.push(service);
  logger.info("MiMo Code webview provider registered");
}

export function deactivate(): void {
  logger?.info("MiMo Code extension deactivated");
}

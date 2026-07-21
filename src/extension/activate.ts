import * as vscode from 'vscode';
import { SidebarProvider } from '../host/SidebarProvider';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new SidebarProvider(context.extensionUri, context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('mimo.sidebar', provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('mimo.checkVersion', () => {
      const ver = context.extension.packageJSON?.version || '?';
      vscode.window.showInformationMessage(`MiMo Code v2 ${ver}`);
    })
  );
}

export function deactivate(): void {
  /* noop */
}

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
  const openSidebar = async () => {
    try {
      await vscode.commands.executeCommand('workbench.view.extension.mimo-activitybar');
    } catch {
      /* older VS Code */
    }
    try {
      await vscode.commands.executeCommand('mimo.sidebar.focus');
    } catch {
      /* ignore */
    }
  };
  context.subscriptions.push(
    vscode.commands.registerCommand('mimo.openSidebar', openSidebar),
    vscode.commands.registerCommand('mimo.focusChat', openSidebar)
  );
}

export function deactivate(): void {
  /* noop */
}

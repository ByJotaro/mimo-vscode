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
  const runHost = async (fn: () => void | Promise<void>) => {
    await openSidebar();
    await fn();
  };
  context.subscriptions.push(
    vscode.commands.registerCommand('mimo.openSidebar', openSidebar),
    vscode.commands.registerCommand('mimo.focusChat', openSidebar),
    vscode.commands.registerCommand('mimo.newSession', () =>
      runHost(() => provider.runCommand('newSession'))
    ),
    vscode.commands.registerCommand('mimo.goHome', () =>
      runHost(() => provider.runCommand('goHome'))
    ),
    vscode.commands.registerCommand('mimo.openHistory', () =>
      runHost(() => provider.runCommand('openHistory'))
    ),
    vscode.commands.registerCommand('mimo.insertSelection', () =>
      runHost(() => provider.runCommand('insertEditorSelection'))
    ),
    vscode.commands.registerCommand('mimo.abort', () =>
      runHost(() => provider.runCommand('abort'))
    )
  );
}

export function deactivate(): void {
  /* noop */
}

import * as vscode from 'vscode';
import { SidebarProvider } from '../host/SidebarProvider';

export function activate(context: vscode.ExtensionContext): void {
  const cfg = vscode.workspace.getConfiguration('mimo');
  const cliPath = String(cfg.get('cliPath') || '').trim();
  if (cliPath) process.env.MIMO_BIN = cliPath;
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('mimo.cliPath')) return;
      const p = String(vscode.workspace.getConfiguration('mimo').get('cliPath') || '').trim();
      if (p) process.env.MIMO_BIN = p;
      else delete process.env.MIMO_BIN;
    })
  );
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  const verShort = String(context.extension.packageJSON?.version || '').replace(/^1\.0\.0-/, '');
  status.text = verShort ? `$(chip) MiMo ${verShort}` : '$(chip) MiMo';
  status.tooltip = 'MiMo Code — open chat (Ctrl+Shift+M)';
  status.command = 'mimo.openSidebar';
  status.show();
  context.subscriptions.push(status);

  const provider = new SidebarProvider(context.extensionUri, context);
  context.subscriptions.push({ dispose: () => provider.dispose() });
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void provider.runCommand('workspaceChanged');
    })
  );
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
    vscode.commands.registerCommand('mimo.focusChat', () => {
      // FOCUS_CHAT_PROMPT
      void vscode.commands.executeCommand('mimo.openSidebar');
      runHost(() => provider.runCommand('focusPrompt'));
    }),
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
    ),
    vscode.commands.registerCommand('mimo.exportSession', () =>
      runHost(() => provider.runCommand('requestExport'))
    ),
    vscode.commands.registerCommand('mimo.forkSession', () =>
      runHost(() => provider.runCommand('forkSession'))
    ),
    vscode.commands.registerCommand('mimo.undo', () =>
      runHost(() => provider.runCommand('undoLast'))
    ),
    vscode.commands.registerCommand('mimo.redo', () =>
      runHost(() => provider.runCommand('redoLast'))
    ),
    vscode.commands.registerCommand('mimo.copySessionId', () =>
      runHost(() => provider.runCommand('copySessionId'))
    ),
    vscode.commands.registerCommand('mimo.showLog', () =>
      runHost(() => provider.runCommand('showLog'))
    ),
    vscode.commands.registerCommand('mimo.doctor', () =>
      runHost(() => provider.runCommand('doctor'))
    ),
    vscode.commands.registerCommand('mimo.focusPrompt', () =>
      runHost(() => provider.runCommand('focusPrompt'))
    ),
    vscode.commands.registerCommand('mimo.refreshModels', () =>
      runHost(() => provider.runCommand('refreshModels'))
    ),
    vscode.commands.registerCommand('mimo.openSettings', () =>
      runHost(() => provider.runCommand('openSettings'))
    ),
    vscode.commands.registerCommand('mimo.reopenLast', () =>
      runHost(() => provider.runCommand('reopenLast'))
    )
  );
}

export function deactivate(): void {
  /* noop */
}

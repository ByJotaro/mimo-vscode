// diff test
import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { SidebarProvider } from './SidebarProvider';
import { OpenCodeDiffProvider } from './OpenCodeDiffProvider';
import { rtLog, rtLogClear } from './rtlog';
import { reapStaleRepoLocks } from './undo/GitLock';

function collectGitRepoRoots(): string[] {
	const roots = new Set<string>();
	const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (ws) {
		roots.add(path.join(ws, '.opencode', 'git', 'repos'));
		roots.add(path.join(ws, '.opencode', 'git'));
	}
	// VS Code install dir used by this machine (seen in lock path errors)
	const appRoots = [
		'D:\\APPS\\Microsoft VS Code\\.opencode\\git\\repos',
		'D:\\APPS\\Microsoft VS Code\\.opencode\\git',
		path.join(process.env.APPDATA || '', 'Code', 'User', 'globalStorage'),
	];
	for (const r of appRoots) {
		if (r && fs.existsSync(r)) roots.add(r);
	}
	return Array.from(roots);
}

export function activate(context: vscode.ExtensionContext) {
	rtLogClear();
	rtLog(`ACTIVATE workspaceRoot=${vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? 'NONE'}`);
	console.log('Congratulations, your extension "opencode-gui" is now active!');

	// Unblock session load: reap leftover .lock files from dead PIDs immediately.
	void (async () => {
		let total = 0;
		for (const root of collectGitRepoRoots()) {
			try {
				const n = await reapStaleRepoLocks(root, (m) => rtLog(m));
				total += n;
			} catch (e) {
				rtLog(`REAP_LOCK_FAIL root=${root} err=${String(e).slice(0, 80)}`);
			}
		}
		rtLog(`REAP_LOCKS total=${total}`);
	})();

    const workspaceRoot = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0]?.uri.fsPath;
    const diffProvider = new OpenCodeDiffProvider(workspaceRoot);

	const sidebarProvider = new SidebarProvider(context, context.extensionUri, diffProvider);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            "mimo.sidebar",
            sidebarProvider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                }
            }
        )
    );

    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider('opencode-diff', diffProvider)
    );

    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
            diffProvider.handleVisibleRangeChange(event.textEditor);
        })
    );

    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection((event) => {
            diffProvider.handleSelectionChange(event.textEditor);
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event) => {
            diffProvider.handleDocumentChange(event.document.uri);
        })
    );

	let disposable = vscode.commands.registerCommand('mimo.checkVersion', () => {
		// Attempt to run opencode --version
		// Assuming 'opencode' is in the PATH. If not, we might need configuration for the path.
		cp.exec('opencode --version', (err, stdout, stderr) => {
			if (err) {
				console.error('Error running opencode:', err);
				vscode.window.showErrorMessage('Error: Could not run "opencode". Please ensure it is installed and in your PATH.');
				return;
			}
			
			if (stderr) {
				console.warn('opencode stderr:', stderr);
			}

			const version = stdout.trim();
			vscode.window.showInformationMessage(`OpenCode Detection Successful! Version: ${version}`);
		});
	});

	context.subscriptions.push(disposable);

	context.subscriptions.push(
		vscode.commands.registerCommand('mimo.clearStaleGitLocks', async () => {
			let total = 0;
			for (const root of collectGitRepoRoots()) {
				try {
					total += await reapStaleRepoLocks(root, (m) => rtLog(m));
				} catch (e) {
					rtLog(`REAP_CMD_FAIL root=${root} err=${String(e).slice(0, 80)}`);
				}
			}
			vscode.window.showInformationMessage(
				total > 0
					? `MiMo Code: cleared ${total} stale git lock(s). Try opening a session again.`
					: 'MiMo Code: no stale git locks found.'
			);
		})
	);

	sidebarProvider.recomputeWorkspaceRoot('activate');
	context.subscriptions.push(
		vscode.workspace.onDidChangeWorkspaceFolders(() => {
			sidebarProvider.recomputeWorkspaceRoot('folders-change');
		})
	);
	setTimeout(() => {
		sidebarProvider.recomputeWorkspaceRoot('delayed-check');
	}, 500);

	context.subscriptions.push(
		vscode.commands.registerCommand('mimo.clearAttachmentsCache', () => {
			sidebarProvider.requestAttachmentCleanup('manual');
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('mimo.sendSelectionToChat', async () => {
			await sidebarProvider.sendEditorSelectionToChat();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('mimo.sendOutputSelectionToChat', async () => {
			await sidebarProvider.sendOutputSelectionToChat();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('mimo.debugTuiControlSchema', async () => {
			await sidebarProvider.debugPrintTuiControlSchema();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('mimo.debugWebviewLivenessMissedAck', async () => {
			await sidebarProvider.debugTriggerWebviewLivenessMissedAck();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('mimo.debugWebviewLivenessAckDropOn', async () => {
			await sidebarProvider.setDebugWebviewLivenessAckDrop(true);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('mimo.debugWebviewLivenessAckDropOff', async () => {
			await sidebarProvider.setDebugWebviewLivenessAckDrop(false);
		})
	);

	context.subscriptions.push(
		new vscode.Disposable(() => {
			void sidebarProvider.shutdownServer();
		})
	);
}

export function deactivate() {
    // Best-effort cleanup handled via Disposable and process handlers.
}


import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext): void {
	const open = vscode.commands.registerCommand("xboctLog.open", () => {
		void vscode.window.showInformationMessage(
			"Xboct Log: панель ещё не реализована.",
		);
	});

	const reload = vscode.commands.registerCommand("xboctLog.reload", () => {
		void vscode.window.showInformationMessage(
			"Xboct Log: нечего перезагружать.",
		);
	});

	context.subscriptions.push(open, reload);
}

export function deactivate(): void {}

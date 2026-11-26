import * as vscode from "vscode";
import { ensureClipboardHelper, stopClipboardHelper } from "./clipboard";
import { VIEW_TYPE } from "./config";
import { stopServer } from "./server";
import {
	activateView,
	closeView,
	notifyTheme,
	openBoard,
	reloadBoard,
	startAndShow,
} from "./webview";

export function activate(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand(`${VIEW_TYPE}.open`, () => {
			void openBoard(context);
		}),
		vscode.commands.registerCommand(`${VIEW_TYPE}.reload`, reloadBoard),
		vscode.commands.registerCommand(`${VIEW_TYPE}.start`, () => {
			void startAndShow(context);
		}),
		vscode.window.onDidChangeActiveColorTheme(notifyTheme),
		activateView(context),
		new vscode.Disposable(stopClipboardHelper),
	);

	if (process.platform === "win32") ensureClipboardHelper();
}

export function deactivate(): void {
	closeView();
	stopServer();
	stopClipboardHelper();
}

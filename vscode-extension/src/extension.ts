import { randomBytes } from "node:crypto";
import * as vscode from "vscode";

const VIEW_TYPE = "xboctLog";
const DEFAULT_SERVER_URL = "http://127.0.0.1:45881";

let panel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand(`${VIEW_TYPE}.open`, () => {
			openBoard(context);
		}),
		vscode.commands.registerCommand(`${VIEW_TYPE}.reload`, () => {
			void panel?.webview.postMessage({ type: "xboct-log:reload" });
		}),
		vscode.window.onDidChangeActiveColorTheme(() => {
			void panel?.webview.postMessage({
				type: "xboct-log:theme",
				theme: currentTheme(),
			});
		}),
	);
}

export function deactivate(): void {
	panel = undefined;
}

function openBoard(context: vscode.ExtensionContext): void {
	if (panel) {
		panel.reveal(vscode.ViewColumn.One);
		return;
	}

	const created = vscode.window.createWebviewPanel(
		VIEW_TYPE,
		"Xboct Log",
		vscode.ViewColumn.One,
		{ enableScripts: true, retainContextWhenHidden: true },
	);

	created.webview.html = panelHtml(currentTheme());
	created.onDidDispose(
		() => {
			panel = undefined;
		},
		null,
		context.subscriptions,
	);

	panel = created;
}

function currentTheme(): "light" | "dark" {
	const kind = vscode.window.activeColorTheme.kind;
	const light =
		kind === vscode.ColorThemeKind.Light ||
		kind === vscode.ColorThemeKind.HighContrastLight;

	return light ? "light" : "dark";
}

function serverUrl(): string {
	const configured = vscode.workspace
		.getConfiguration("xboctLog")
		.get<string>("serverUrl", DEFAULT_SERVER_URL);

	return configured.replace(/\/+$/, "");
}

function frameOrigin(): string {
	try {
		return new URL(serverUrl()).origin;
	} catch {
		return serverUrl();
	}
}

function panelHtml(theme: "light" | "dark"): string {
	const nonce = randomBytes(16).toString("hex");
	const src = `${serverUrl()}/?theme=${theme}`;

	return `<!DOCTYPE html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta
			http-equiv="Content-Security-Policy"
			content="default-src 'none'; frame-src ${frameOrigin()}; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'"
		/>
		<style>
			html,
			body {
				margin: 0;
				height: 100%;
				overflow: hidden;
			}

			#board {
				display: block;
				border: 0;
				width: 100%;
				height: 100%;
			}
		</style>
	</head>
	<body>
		<iframe id="board" src="${src}"></iframe>
		<script nonce="${nonce}">
			const frame = document.getElementById("board");
			const base = frame.getAttribute("src");

			window.addEventListener("message", (event) => {
				const data = event.data;
				if (!data || typeof data !== "object") return;

				if (data.type === "xboct-log:theme") {
					frame.contentWindow.postMessage(data, "*");
				}

				if (data.type === "xboct-log:reload") {
					frame.setAttribute("src", base + "&_=" + Date.now());
				}
			});
		</script>
	</body>
</html>`;
}

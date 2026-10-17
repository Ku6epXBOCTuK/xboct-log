import { randomBytes } from "node:crypto";
import * as vscode from "vscode";

const VIEW_TYPE = "xboctLog";
const DEFAULT_SERVER_URL = "http://127.0.0.1:45881";
const HEALTH_TIMEOUT_MS = 1500;

let current: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand(`${VIEW_TYPE}.open`, () => {
			void openBoard(context);
		}),
		vscode.commands.registerCommand(`${VIEW_TYPE}.reload`, () => {
			void current?.webview.postMessage({ type: "xboct-log:reload" });
		}),
		vscode.window.onDidChangeActiveColorTheme(() => {
			void current?.webview.postMessage({
				type: "xboct-log:theme",
				theme: currentTheme(),
			});
		}),
		vscode.window.registerWebviewPanelSerializer(VIEW_TYPE, {
			deserializeWebviewPanel: async (panel) => {
				attach(panel, context);
				await render(panel);
			},
		}),
	);
}

export function deactivate(): void {
	current = undefined;
}

async function openBoard(context: vscode.ExtensionContext): Promise<void> {
	if (current) {
		current.reveal(vscode.ViewColumn.One);
		return;
	}

	const panel = vscode.window.createWebviewPanel(
		VIEW_TYPE,
		"Xboct Log",
		vscode.ViewColumn.One,
		{ enableScripts: true, retainContextWhenHidden: true },
	);

	attach(panel, context);
	await render(panel);
}

function attach(
	panel: vscode.WebviewPanel,
	context: vscode.ExtensionContext,
): void {
	panel.webview.options = { enableScripts: true };

	const messages = panel.webview.onDidReceiveMessage((message) => {
		if (isMessage(message, "xboct-log:retry")) void render(panel);
		if (isMessage(message, "xboct-log:next-tab")) {
			void vscode.commands.executeCommand(
				"workbench.action.openNextRecentlyUsedEditorInGroup",
			);
		}
		if (isMessage(message, "xboct-log:prev-tab")) {
			void vscode.commands.executeCommand(
				"workbench.action.openPreviousRecentlyUsedEditorInGroup",
			);
		}
	});

	panel.onDidDispose(
		() => {
			messages.dispose();

			if (current === panel) {
				current = undefined;
			}
		},
		null,
		context.subscriptions,
	);

	current = panel;
}

async function render(panel: vscode.WebviewPanel): Promise<void> {
	panel.webview.html = (await isServerUp())
		? boardHtml(currentTheme())
		: offlineHtml();
}

function isMessage(message: unknown, type: string): boolean {
	return (
		typeof message === "object" &&
		message !== null &&
		(message as { type?: unknown }).type === type
	);
}

async function isServerUp(): Promise<boolean> {
	try {
		const response = await fetch(`${serverUrl()}/api/health`, {
			signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
		});

		return response.ok;
	} catch {
		return false;
	}
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

function boardHtml(theme: "light" | "dark"): string {
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
			const api = acquireVsCodeApi();

			window.addEventListener("message", (event) => {
				const data = event.data;
				if (!data || typeof data !== "object") return;

				if (data.type === "xboct-log:theme") {
					frame.contentWindow.postMessage(data, "*");
				}

				if (data.type === "xboct-log:reload") {
					frame.setAttribute("src", base + "&_=" + Date.now());
				}

				if (data.type === "xboct-log:next-tab") {
					api.postMessage({ type: "xboct-log:next-tab" });
				}

				if (data.type === "xboct-log:prev-tab") {
					api.postMessage({ type: "xboct-log:prev-tab" });
				}
			});
		</script>
	</body>
</html>`;
}

function offlineHtml(): string {
	const nonce = randomBytes(16).toString("hex");

	return `<!DOCTYPE html>
<html lang="ru">
	<head>
		<meta charset="utf-8" />
		<meta
			http-equiv="Content-Security-Policy"
			content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'"
		/>
		<style>
			body {
				display: grid;
				place-content: center;
				gap: 0.75rem;
				box-sizing: border-box;
				height: 100vh;
				margin: 0;
				padding: 2rem;
				font-family: var(--vscode-font-family);
				font-size: var(--vscode-font-size);
				color: var(--vscode-foreground);
				background: var(--vscode-editor-background);
				text-align: center;
			}

			h1 {
				margin: 0;
				font-size: 1.1em;
				font-weight: 600;
			}

			p {
				margin: 0;
				color: var(--vscode-descriptionForeground);
			}

			code {
				padding: 0.1em 0.35em;
				border-radius: 3px;
				font-family: var(--vscode-editor-font-family);
				background: var(--vscode-textCodeBlock-background);
			}

			button {
				justify-self: center;
				padding: 0.35em 1em;
				border: 0;
				border-radius: 3px;
				font: inherit;
				color: var(--vscode-button-foreground);
				background: var(--vscode-button-background);
				cursor: pointer;
			}

			button:hover {
				background: var(--vscode-button-hoverBackground);
			}
		</style>
	</head>
	<body>
		<h1>Xboct Log не отвечает</h1>
		<p>
			Служба <code>xboct-log</code> не отвечает на
			<code>${serverUrl()}/api/health</code>.
		</p>
		<p>Запуск: <code>nssm start xboct-log</code></p>
		<button id="retry">Проверить снова</button>
		<script nonce="${nonce}">
			const api = acquireVsCodeApi();
			const button = document.getElementById("retry");

			function retry() {
				button.disabled = true;
				button.textContent = "Проверяю…";
				api.postMessage({ type: "xboct-log:retry" });
			}

			button.addEventListener("click", retry);

			window.addEventListener("message", (event) => {
				const data = event.data;
				if (data && data.type === "xboct-log:reload") retry();
			});
		</script>
	</body>
</html>`;
}

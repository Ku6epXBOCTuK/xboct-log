import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import { copyImageToClipboard } from "./clipboard";
import {
	autoStart,
	currentTheme,
	frameOrigin,
	serverUrl,
	VIEW_TYPE,
} from "./config";
import { openRepoFile } from "./repo";
import {
	ensureStarted,
	failureReason,
	isServerUp,
	startServer,
} from "./server";

const RELEASES_URL = "https://github.com/Ku6epXBOCTuK/xboct-log/releases";

let current: vscode.WebviewPanel | undefined;

export function activateView(
	context: vscode.ExtensionContext,
): vscode.Disposable {
	return vscode.window.registerWebviewPanelSerializer(VIEW_TYPE, {
		deserializeWebviewPanel: async (panel) => {
			attach(panel, context);
			await render(panel);
		},
	});
}

export function closeView(): void {
	current = undefined;
}

export function reloadBoard(): void {
	void current?.webview.postMessage({ type: "xboct-log:reload" });
}

export function notifyTheme(): void {
	void current?.webview.postMessage({
		type: "xboct-log:theme",
		theme: currentTheme(),
	});
}

export async function openBoard(
	context: vscode.ExtensionContext,
): Promise<void> {
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

export async function startAndShow(
	context: vscode.ExtensionContext,
): Promise<void> {
	await openBoard(context);
	await startServer();
	if (current) await render(current);
}

function attach(
	panel: vscode.WebviewPanel,
	context: vscode.ExtensionContext,
): void {
	panel.webview.options = { enableScripts: true };

	const messages = panel.webview.onDidReceiveMessage((message) => {
		if (isMessage(message, "xboct-log:retry")) void render(panel);
		if (isMessage(message, "xboct-log:start")) void startAndShow(context);
		if (isMessage(message, "xboct-log:settings")) {
			void vscode.commands.executeCommand(
				"workbench.action.openSettings",
				"xboctLog",
			);
		}
		if (isMessage(message, "xboct-log:download")) {
			void vscode.env.openExternal(vscode.Uri.parse(RELEASES_URL));
		}
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
		if (isMessage(message, "xboct-log:open-media")) {
			const url = (message as { url?: unknown }).url;
			if (typeof url === "string" && isServerUrl(url)) {
				void vscode.env.openExternal(vscode.Uri.parse(url));
			}
		}
		if (isMessage(message, "xboct-log:open-external")) {
			const url = (message as { url?: unknown }).url;
			if (typeof url === "string" && isExternalUrl(url)) {
				void vscode.env.openExternal(vscode.Uri.parse(url));
			}
		}
		if (isMessage(message, "xboct-log:open-file")) {
			const { repo, path } = message as { repo?: unknown; path?: unknown };
			void openRepoFile(
				typeof repo === "string" ? repo : "",
				typeof path === "string" ? path : "",
			);
		}
		if (isMessage(message, "xboct-log:copy-image")) {
			const { requestId, png } = message as {
				requestId?: unknown;
				png?: unknown;
			};
			if (typeof requestId === "string" && typeof png === "string") {
				void copyImageToClipboard(png).then((ok) => {
					void panel.webview.postMessage({
						type: "xboct-log:copy-image-result",
						requestId,
						ok,
					});
				});
			}
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

export async function render(panel: vscode.WebviewPanel): Promise<void> {
	if (await isServerUp()) {
		panel.webview.html = boardHtml(currentTheme());
		return;
	}

	if (!autoStart()) {
		panel.webview.html = offlineHtml("Сервис не запущен.");
		return;
	}

	panel.webview.html = startingHtml();
	const started = await ensureStarted();

	if (started && (await isServerUp())) {
		panel.webview.html = boardHtml(currentTheme());
		return;
	}

	panel.webview.html = offlineHtml(failureReason(started));
}

function isMessage(message: unknown, type: string): boolean {
	return (
		typeof message === "object" &&
		message !== null &&
		(message as { type?: unknown }).type === type
	);
}

function isServerUrl(value: string): boolean {
	try {
		return new URL(value).origin === new URL(serverUrl()).origin;
	} catch {
		return false;
	}
}

const EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function isExternalUrl(value: string): boolean {
	try {
		return EXTERNAL_PROTOCOLS.has(new URL(value).protocol);
	} catch {
		return false;
	}
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function page(body: string, script: string): string {
	const nonce = randomBytes(16).toString("hex");

	return `<!DOCTYPE html>
<html lang="ru">
	<head>
		<meta charset="utf-8" />
		<meta
			http-equiv="Content-Security-Policy"
			content="default-src 'none'; frame-src ${frameOrigin()}; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'"
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

			.actions {
				display: flex;
				flex-wrap: wrap;
				justify-content: center;
				gap: 0.5rem;
			}

			button {
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

			button.secondary {
				color: var(--vscode-button-secondaryForeground);
				background: var(--vscode-button-secondaryBackground);
			}

			button.secondary:hover {
				background: var(--vscode-button-secondaryHoverBackground);
			}

			button:disabled {
				opacity: 0.5;
				cursor: default;
			}
		</style>
	</head>
	<body>
		${body}
		<script nonce="${nonce}">
			const api = acquireVsCodeApi();
			${script}
		</script>
	</body>
</html>`;
}

function boardHtml(theme: "light" | "dark"): string {
	const src = `${serverUrl()}/?theme=${theme}`;

	return page(
		`<iframe id="board" src="${src}" allow="clipboard-write" style="position:fixed;inset:0;border:0;width:100%;height:100%"></iframe>`,
		`
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

				if (data.type === "xboct-log:next-tab") {
					api.postMessage({ type: "xboct-log:next-tab" });
				}

				if (data.type === "xboct-log:prev-tab") {
					api.postMessage({ type: "xboct-log:prev-tab" });
				}

				if (data.type === "xboct-log:open-media") {
					api.postMessage({ type: "xboct-log:open-media", url: data.url });
				}

				if (data.type === "xboct-log:open-external") {
					api.postMessage({
						type: "xboct-log:open-external",
						url: data.url,
					});
				}

				if (data.type === "xboct-log:open-file") {
					api.postMessage({
						type: "xboct-log:open-file",
						repo: data.repo,
						path: data.path,
					});
				}

				if (data.type === "xboct-log:copy-image") {
					api.postMessage({
						type: "xboct-log:copy-image",
						requestId: data.requestId,
						png: data.png,
					});
				}

				if (data.type === "xboct-log:copy-image-result") {
					frame.contentWindow.postMessage(data, "*");
				}
			});
		`,
	);
}

function startingHtml(): string {
	return page(`<h1>Xboct Log</h1><p>Запускаю сервис…</p>`, "");
}

function offlineHtml(reason: string): string {
	return page(
		`
			<h1>Xboct Log не отвечает</h1>
			<p>${escapeHtml(reason)} Адрес: <code>${escapeHtml(serverUrl())}</code></p>
			<div class="actions">
				<button id="start">Запустить</button>
				<button id="retry" class="secondary">Проверить снова</button>
				<button id="settings" class="secondary">Настройки</button>
				<button id="download" class="secondary">Скачать</button>
			</div>
		`,
		`
			const buttons = ["start", "retry", "settings", "download"];

			for (const id of buttons) {
				const button = document.getElementById(id);
				button.addEventListener("click", () => {
					api.postMessage({ type: "xboct-log:" + id });
					if (id === "start" || id === "retry") {
						button.disabled = true;
						button.textContent = "Проверяю…";
					}
				});
			}

			window.addEventListener("message", (event) => {
				const data = event.data;
				if (data && data.type === "xboct-log:reload") {
					api.postMessage({ type: "xboct-log:retry" });
				}
			});
		`,
	);
}

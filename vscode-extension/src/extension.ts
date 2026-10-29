import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";

const VIEW_TYPE = "xboctLog";
const DEFAULT_SERVER_URL = "http://127.0.0.1:45881";
const HEALTH_TIMEOUT_MS = 1500;
const START_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 500;
const RELEASES_URL = "https://github.com/Ku6epXBOCTuK/xboct-log/releases";
const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
const PNG_SIGNATURE = "89504e470d0a1a0a";

let current: vscode.WebviewPanel | undefined;
let serverProcess: ChildProcess | undefined;

export function activate(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand(`${VIEW_TYPE}.open`, () => {
			void openBoard(context);
		}),
		vscode.commands.registerCommand(`${VIEW_TYPE}.reload`, () => {
			void current?.webview.postMessage({ type: "xboct-log:reload" });
		}),
		vscode.commands.registerCommand(`${VIEW_TYPE}.start`, () => {
			void startAndShow(context);
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
		new vscode.Disposable(stopClipboardHelper),
	);

	if (process.platform === "win32") ensureClipboardHelper();
}

export function deactivate(): void {
	current = undefined;
	stopServer();
	stopClipboardHelper();
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

async function startAndShow(context: vscode.ExtensionContext): Promise<void> {
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

async function render(panel: vscode.WebviewPanel): Promise<void> {
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

	panel.webview.html = offlineHtml(
		started ? "Сервис не ответил вовремя." : "Не удалось запустить сервис.",
	);
}

function ensureStarted(): Thenable<boolean> {
	return vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: "Запускаю Xboct Log",
			cancellable: false,
		},
		async () => {
			await startServer();
			return waitForServer();
		},
	);
}

async function waitForServer(): Promise<boolean> {
	const deadline = Date.now() + START_TIMEOUT_MS;

	while (Date.now() < deadline) {
		if (await isServerUp()) return true;
		await new Promise((done) => setTimeout(done, POLL_INTERVAL_MS));
	}

	return false;
}

async function startServer(): Promise<void> {
	if (await isServerUp()) return;
	if (serverProcess) return;

	const command = serverCommand();
	const port = portFromUrl();
	const args = ["--no-open", "--port", port];
	const dataDir = configuration().get<string>("dataDir", "").trim();

	if (dataDir) args.push("--data", dataDir);

	try {
		const child = spawn(quote(command), args.map(quote), {
			shell: true,
			windowsHide: true,
			stdio: "ignore",
		});

		child.on("exit", () => {
			if (serverProcess === child) serverProcess = undefined;
		});
		child.on("error", () => {
			if (serverProcess === child) serverProcess = undefined;
		});

		serverProcess = child;
	} catch {
		serverProcess = undefined;
	}
}

function stopServer(): void {
	const child = serverProcess;
	serverProcess = undefined;

	if (!child?.pid) return;

	if (process.platform === "win32") {
		spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
			windowsHide: true,
			stdio: "ignore",
		});
		return;
	}

	child.kill();
}

function serverCommand(): string {
	const configured = configuration().get<string>("serverPath", "").trim();
	if (configured) return configured;

	if (process.platform === "win32" && process.env.LOCALAPPDATA) {
		for (const folder of ["Xboct Log", "xboct-log"]) {
			const candidate = join(
				process.env.LOCALAPPDATA,
				"Programs",
				folder,
				"xboct-log.cmd",
			);

			if (existsSync(candidate)) return candidate;
		}
	}

	return "xboct-log";
}

function quote(value: string): string {
	return /\s/.test(value) ? `"${value}"` : value;
}

function configuration(): vscode.WorkspaceConfiguration {
	return vscode.workspace.getConfiguration("xboctLog");
}

function autoStart(): boolean {
	return configuration().get<boolean>("autoStart", true);
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

async function copyImageToClipboard(png: string): Promise<boolean> {
	const data = Buffer.from(png, "base64");
	if (data.byteLength === 0 || data.byteLength > MAX_IMAGE_BYTES) return false;
	if (data.subarray(0, 8).toString("hex") !== PNG_SIGNATURE) return false;
	if (process.platform === "win32" && (await copyWithHelper(png))) return true;
	return copyWithCommand(data);
}

async function copyWithCommand(data: Buffer): Promise<boolean> {
	const folder = await mkdtemp(join(tmpdir(), "xboct-log-"));
	const file = join(folder, "image.png");
	try {
		await writeFile(file, data);
		await setClipboardImage(file);
		return true;
	} catch (error) {
		console.warn("xboct-log: cannot copy the image", error);
		return false;
	} finally {
		await rm(folder, { recursive: true, force: true });
	}
}

const CLIPBOARD_TIMEOUT_MS = 10_000;

const HELPER_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
$probe = [Convert]::FromBase64String('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
$probeStream = New-Object System.IO.MemoryStream(,$probe)
$probeImage = [System.Drawing.Image]::FromStream($probeStream)
$probeImage.Dispose()
$probeStream.Dispose()
$clipboardType = [System.Windows.Forms.Clipboard]
[Console]::Out.WriteLine('ready')
[Console]::Out.Flush()
while ($true) {
	$line = [Console]::In.ReadLine()
	if ($null -eq $line) { break }
	try {
		$bytes = [Convert]::FromBase64String($line)
		$stream = New-Object System.IO.MemoryStream(,$bytes)
		$image = [System.Drawing.Image]::FromStream($stream)
		[System.Windows.Forms.Clipboard]::SetImage($image)
		$image.Dispose()
		$stream.Dispose()
		[Console]::Out.WriteLine('ok')
	} catch {
		[Console]::Out.WriteLine('err ' + $_.Exception.Message)
	}
	[Console]::Out.Flush()
}
`;

interface ClipboardHelper {
	process: ChildProcess;
	buffer: string;
	pending: Array<(copied: boolean) => void>;
}

let clipboardHelper: ClipboardHelper | undefined;

function ensureClipboardHelper(): ClipboardHelper | undefined {
	if (clipboardHelper !== undefined) return clipboardHelper;
	const encoded = Buffer.from(HELPER_SCRIPT, "utf16le").toString("base64");
	let child: ChildProcess;
	try {
		child = spawn(
			"powershell.exe",
			["-NoProfile", "-NonInteractive", "-Sta", "-EncodedCommand", encoded],
			{ windowsHide: true, stdio: ["pipe", "pipe", "ignore"] },
		);
	} catch (error) {
		console.warn("xboct-log: cannot start the clipboard helper", error);
		return undefined;
	}
	const helper: ClipboardHelper = { process: child, buffer: "", pending: [] };
	child.stdout?.setEncoding("utf8");
	child.stdout?.on("data", (chunk: string) => {
		helper.buffer += chunk;
		let end = helper.buffer.indexOf("\n");
		while (end !== -1) {
			const line = helper.buffer.slice(0, end).trim();
			helper.buffer = helper.buffer.slice(end + 1);
			if (line !== "ready") helper.pending.shift()?.(line === "ok");
			end = helper.buffer.indexOf("\n");
		}
	});
	const reset = () => {
		if (clipboardHelper === helper) clipboardHelper = undefined;
		for (const settle of helper.pending.splice(0)) settle(false);
	};
	child.on("exit", reset);
	child.on("error", reset);
	clipboardHelper = helper;
	return helper;
}

function stopClipboardHelper(): void {
	const helper = clipboardHelper;
	clipboardHelper = undefined;
	if (helper === undefined) return;
	for (const settle of helper.pending.splice(0)) settle(false);
	helper.process.kill();
}

function copyWithHelper(png: string): Promise<boolean> {
	const helper = ensureClipboardHelper();
	if (helper === undefined) return Promise.resolve(false);
	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			stopClipboardHelper();
			resolve(false);
		}, CLIPBOARD_TIMEOUT_MS);
		helper.pending.push((copied) => {
			clearTimeout(timer);
			resolve(copied);
		});
		helper.process.stdin?.write(`${png}\n`);
	});
}

function setClipboardImage(file: string): Promise<void> {
	const command = clipboardCommand(file);
	if (command === undefined) {
		return Promise.reject(new Error("the platform is not supported"));
	}
	return new Promise((resolve, reject) => {
		execFile(
			command.name,
			command.args,
			{ timeout: 15_000, windowsHide: true },
			(error) => {
				if (error) reject(error);
				else resolve();
			},
		);
	});
}

function clipboardCommand(
	file: string,
): { name: string; args: string[] } | undefined {
	if (process.platform === "win32") {
		const path = file.replace(/'/g, "''");
		const script = [
			"Add-Type -AssemblyName System.Windows.Forms",
			"Add-Type -AssemblyName System.Drawing",
			`$image=[System.Drawing.Image]::FromFile('${path}')`,
			"[System.Windows.Forms.Clipboard]::SetImage($image)",
			"$image.Dispose()",
		].join("; ");
		return {
			name: "powershell.exe",
			args: ["-Sta", "-NoProfile", "-NonInteractive", "-Command", script],
		};
	}
	if (process.platform === "darwin") {
		return {
			name: "osascript",
			args: [
				"-e",
				`set the clipboard to (read (POSIX file "${file}") as «class PNGf»)`,
			],
		};
	}
	return {
		name: "sh",
		args: [
			"-c",
			'command -v wl-copy >/dev/null && wl-copy --type image/png < "$1" || xclip -selection clipboard -t image/png -i "$1"',
			"sh",
			file,
		],
	};
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
	const configured = configuration().get<string>(
		"serverUrl",
		DEFAULT_SERVER_URL,
	);

	return configured.replace(/\/+$/, "");
}

function portFromUrl(): string {
	try {
		return new URL(serverUrl()).port || "45881";
	} catch {
		return "45881";
	}
}

function frameOrigin(): string {
	try {
		return new URL(serverUrl()).origin;
	} catch {
		return serverUrl();
	}
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
			<p>${reason} Адрес: <code>${serverUrl()}</code></p>
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

import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import * as vscode from "vscode";
import {
	APP_NAME,
	configuration,
	portFromUrl,
	serverUrl,
	VIEW_TYPE,
} from "./config";

const HEALTH_TIMEOUT_MS = 1500;
const START_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 500;

let serverProcess: ChildProcess | undefined;
let serverFailure: string | undefined;
let dataMismatch = false;

export async function isServerUp(): Promise<boolean> {
	try {
		const response = await fetch(`${serverUrl()}/api/health`, {
			signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
		});

		if (!response.ok) return false;
		const body = (await response.json()) as {
			app?: unknown;
			data?: unknown;
		};
		if (body?.app !== APP_NAME) return false;

		const expected = configuredDataId();
		dataMismatch =
			expected !== undefined &&
			typeof body.data === "string" &&
			body.data !== expected;
		return !dataMismatch;
	} catch {
		dataMismatch = false;
		return false;
	}
}

function configuredDataId(): string | undefined {
	const dataDir = configuration().get<string>("dataDir", "").trim();
	if (dataDir === "" || !isAbsolute(dataDir)) return undefined;

	return fingerprintPath(dataDir);
}

function fingerprintPath(path: string): string {
	const absolute = resolve(path).replace(/\\/g, "/");
	const normalized =
		process.platform === "win32" ? absolute.toLowerCase() : absolute;

	return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

export function ensureStarted(): Thenable<boolean> {
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
		if (serverFailure !== undefined && serverProcess === undefined)
			return false;
		await new Promise((done) => setTimeout(done, POLL_INTERVAL_MS));
	}

	return false;
}

export async function startServer(): Promise<void> {
	if (await isServerUp()) return;
	if (serverProcess) return;

	const command = serverCommand();
	const port = portFromUrl();
	const args = ["--no-open", "--port", port];
	const dataDir = configuration().get<string>("dataDir", "").trim();

	if (!dataDir) {
		serverFailure = `set "${VIEW_TYPE}.dataDir" to the data folder of this instance before starting the server`;
		return;
	}
	args.push("--data", dataDir);

	serverFailure = undefined;

	try {
		const child = spawn(quote(command), args.map(quote), {
			shell: true,
			windowsHide: true,
			stdio: ["ignore", "ignore", "pipe"],
		});

		let stderr = "";
		child.stderr?.setEncoding("utf8");
		child.stderr?.on("data", (chunk: string) => {
			stderr = (stderr + chunk).slice(-2000);
		});

		child.on("exit", (code) => {
			if (serverProcess === child) serverProcess = undefined;
			if (code !== 0 && code !== null)
				serverFailure = lastLine(stderr) ?? `код ${code}`;
		});
		child.on("error", (error) => {
			if (serverProcess === child) serverProcess = undefined;
			serverFailure = error.message;
		});

		serverProcess = child;
	} catch (error) {
		serverProcess = undefined;
		serverFailure = error instanceof Error ? error.message : String(error);
	}
}

function lastLine(output: string): string | undefined {
	const lines = output
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line !== "");

	return lines.at(-1);
}

export function stopServer(): void {
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

export function failureReason(started: boolean): string {
	if (started) return "Сервис не ответил вовремя.";
	if (serverFailure !== undefined)
		return `Сервис не запустился: ${serverFailure}`;
	if (dataMismatch)
		return `Порт ${portFromUrl()} занят другим Xboct Log с другой папкой данных.`;
	return "Не удалось запустить сервис.";
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

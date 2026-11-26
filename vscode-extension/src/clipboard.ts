import { execFile, spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
const PNG_SIGNATURE = "89504e470d0a1a0a";
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

export async function copyImageToClipboard(png: string): Promise<boolean> {
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

export function ensureClipboardHelper(): ClipboardHelper | undefined {
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

export function stopClipboardHelper(): void {
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

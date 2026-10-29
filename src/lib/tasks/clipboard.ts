export function taskText(title: string, description: string): string {
	const body = description.trim();
	return body === "" ? title : `${title}\n\n${body}`;
}

export async function copyText(text: string): Promise<boolean> {
	if (text === "") return false;
	try {
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(text);
			return true;
		}
	} catch {
		// NOTE: the clipboard API needs a secure context, the fallback works without it.
	}
	return copyWithSelection(text);
}

const HOST_TIMEOUT_MS = 20_000;
const requests = new Map<string, (copied: boolean) => void>();

export async function copyImage(image: HTMLImageElement): Promise<boolean> {
	if (window.parent !== window) return copyViaHost(image.src);
	return writeImageBlob(image.src);
}

async function copyViaHost(src: string): Promise<boolean> {
	const png = await imageBase64(src);
	if (png === undefined) return false;
	const requestId = crypto.randomUUID();
	const result = new Promise<boolean>((resolve) => {
		requests.set(requestId, resolve);
		setTimeout(() => settle(requestId, false), HOST_TIMEOUT_MS);
	});
	window.parent.postMessage(
		{ type: "xboct-log:copy-image", requestId, png },
		"*",
	);
	return result;
}

function settle(requestId: string, copied: boolean): void {
	const resolve = requests.get(requestId);
	if (resolve === undefined) return;
	requests.delete(requestId);
	resolve(copied);
}

if (typeof window !== "undefined") {
	window.addEventListener("message", (event: MessageEvent) => {
		const data = event.data as {
			type?: unknown;
			requestId?: unknown;
			ok?: unknown;
		};
		if (data?.type !== "xboct-log:copy-image-result") return;
		if (typeof data.requestId !== "string") return;
		settle(data.requestId, data.ok === true);
	});
}

async function imageBase64(src: string): Promise<string | undefined> {
	try {
		const blob = await fetch(src).then((response) => response.blob());
		return await toBase64(await toPng(blob));
	} catch (error) {
		console.warn("xboct-log: cannot read the image", error);
		return undefined;
	}
}

function toBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result;
			resolve(
				typeof result === "string" ? result.slice(result.indexOf(",") + 1) : "",
			);
		};
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}

async function writeImageBlob(src: string): Promise<boolean> {
	if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
		return false;
	}
	try {
		const blob = await fetch(src).then((response) => response.blob());
		const png = await toPng(blob);
		await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
		return true;
	} catch (error) {
		console.warn("xboct-log: the clipboard image write failed", error);
		return false;
	}
}

async function toPng(blob: Blob): Promise<Blob> {
	if (blob.type === "image/png") return blob;
	const bitmap = await createImageBitmap(blob);
	try {
		const canvas = document.createElement("canvas");
		canvas.width = bitmap.width;
		canvas.height = bitmap.height;
		const context = canvas.getContext("2d");
		if (context === null) throw new Error("no 2d context");
		context.drawImage(bitmap, 0, 0);
		const png = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, "image/png"),
		);
		if (png === null) throw new Error("cannot encode the image");
		return png;
	} finally {
		bitmap.close();
	}
}

function copyWithSelection(text: string): boolean {
	const area = document.createElement("textarea");
	area.value = text;
	area.setAttribute("readonly", "");
	area.style.position = "fixed";
	area.style.opacity = "0";
	document.body.appendChild(area);
	area.select();
	const copied = document.execCommand("copy");
	area.remove();
	return copied;
}

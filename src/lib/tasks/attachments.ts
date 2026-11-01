import { messageOf } from "#lib/tasks/display.ts";
import type { TaskAttachment } from "#lib/types.ts";

export type AttachmentEntry =
	| { kind: "file"; key: string; file: File }
	| { kind: "saved"; key: string; attachment: TaskAttachment };

export interface UploadFailure {
	name: string;
	message: string;
}

export interface UploadOutcome {
	attached: string[];
	failed: UploadFailure[];
}

export async function attachEach<T extends { key: string; file: File }>(
	items: T[],
	attach: (item: T) => Promise<void>,
): Promise<UploadOutcome> {
	const attached: string[] = [];
	const failed: UploadFailure[] = [];
	for (const item of items) {
		try {
			await attach(item);
			attached.push(item.key);
		} catch (error) {
			failed.push({ name: item.file.name, message: messageOf(error) });
		}
	}
	return { attached, failed };
}

export function fileToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = typeof reader.result === "string" ? reader.result : "";
			const comma = result.indexOf(",");
			resolve(comma >= 0 ? result.slice(comma + 1) : result);
		};
		reader.onerror = () =>
			reject(reader.error ?? new Error("the file cannot be read"));
		reader.readAsDataURL(file);
	});
}

export function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function isImage(mime: string | null): boolean {
	return mime !== null && mime.startsWith("image/");
}

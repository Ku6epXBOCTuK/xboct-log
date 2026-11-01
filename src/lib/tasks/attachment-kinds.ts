export type AttachmentKind = "image" | "pdf" | "text" | "file";

export interface AttachmentFormat {
	extension: string;
	mime: string;
	kind: AttachmentKind;
}

export const ATTACHMENT_FORMATS: Record<
	string,
	{ mime: string; kind: AttachmentKind }
> = {
	png: { mime: "image/png", kind: "image" },
	jpg: { mime: "image/jpeg", kind: "image" },
	jpeg: { mime: "image/jpeg", kind: "image" },
	gif: { mime: "image/gif", kind: "image" },
	webp: { mime: "image/webp", kind: "image" },
	avif: { mime: "image/avif", kind: "image" },
	bmp: { mime: "image/bmp", kind: "image" },
	ico: { mime: "image/x-icon", kind: "image" },
	pdf: { mime: "application/pdf", kind: "pdf" },
	txt: { mime: "text/plain", kind: "text" },
	md: { mime: "text/markdown", kind: "text" },
	json: { mime: "application/json", kind: "text" },
	csv: { mime: "text/csv", kind: "text" },
	log: { mime: "text/plain", kind: "text" },
	zip: { mime: "application/zip", kind: "file" },
	"7z": { mime: "application/x-7z-compressed", kind: "file" },
	rar: { mime: "application/vnd.rar", kind: "file" },
	tar: { mime: "application/x-tar", kind: "file" },
	gz: { mime: "application/gzip", kind: "file" },
	doc: { mime: "application/msword", kind: "file" },
	docx: {
		mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		kind: "file",
	},
	xls: { mime: "application/vnd.ms-excel", kind: "file" },
	xlsx: {
		mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		kind: "file",
	},
	ppt: { mime: "application/vnd.ms-powerpoint", kind: "file" },
	pptx: {
		mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
		kind: "file",
	},
};

export const ATTACHMENT_ACCEPT = Object.keys(ATTACHMENT_FORMATS)
	.map((extension) => `.${extension}`)
	.join(",");

const FORMAT_BY_MIME: Record<string, AttachmentFormat> = {};
for (const [extension, format] of Object.entries(ATTACHMENT_FORMATS)) {
	if (FORMAT_BY_MIME[format.mime] !== undefined) continue;
	FORMAT_BY_MIME[format.mime] = { extension, ...format };
}

export function extensionOf(name: string): string {
	const dot = name.lastIndexOf(".");
	if (dot < 0) return "";
	const extension = name.slice(dot + 1).toLowerCase();
	return /^[a-z0-9]{1,10}$/.test(extension) ? extension : "";
}

export function attachmentFormat(
	fileName: string,
	mimeType?: string | null,
): AttachmentFormat | null {
	const extension = extensionOf(fileName);
	const known = ATTACHMENT_FORMATS[extension];
	if (known !== undefined) return { extension, ...known };
	if (extension !== "") return null;
	const declared = mimeType?.split(";")[0]?.trim().toLowerCase() ?? "";
	return FORMAT_BY_MIME[declared] ?? null;
}

export function attachmentKind(
	fileName: string,
	mimeType?: string | null,
): AttachmentKind | "blocked" {
	return attachmentFormat(fileName, mimeType)?.kind ?? "blocked";
}

export function filterFiles(files: File[]): {
	accepted: File[];
	rejected: File[];
} {
	const accepted: File[] = [];
	const rejected: File[] = [];
	for (const file of files) {
		if (attachmentFormat(file.name, file.type) === null) {
			rejected.push(file);
		} else {
			accepted.push(file);
		}
	}
	return { accepted, rejected };
}

export function rejectionMessage(files: File[]): string {
	if (files.length === 0) return "";
	const advice = "Attach images, PDFs, text or archives.";
	if (files.length === 1) {
		const name = files[0]?.name ?? "";
		return name === ""
			? `This file is not supported. ${advice}`
			: `${name} is not supported. ${advice}`;
	}
	return `None of the ${files.length} files are supported. ${advice}`;
}

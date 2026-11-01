import { attachmentFormat } from "../tasks/attachment-kinds.ts";

export const MEDIA_CONTENT_SECURITY_POLICY = "default-src 'none'; sandbox";

export function mediaHeaders(fileName: string): Record<string, string> {
	const name = fileName.replace(/["\\\r\n]/g, "_");
	const format = attachmentFormat(fileName);
	const inline = format !== null && format.kind !== "file";
	const headers: Record<string, string> = {
		"content-type": format?.mime ?? "application/octet-stream",
		"content-disposition": `${inline ? "inline" : "attachment"}; filename="${name}"`,
		"x-content-type-options": "nosniff",
	};
	// NOTE: Chromium's PDF viewer is blocked by the sandbox directive (crbug 41131921)
	if (inline && format.kind !== "pdf") {
		headers["content-security-policy"] = MEDIA_CONTENT_SECURITY_POLICY;
	}
	return headers;
}

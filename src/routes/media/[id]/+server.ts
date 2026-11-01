import { readAttachmentFile } from "#lib/server/attachments.ts";
import { getDb } from "#lib/server/db.ts";
import { attachmentKind } from "#lib/tasks/attachment-kinds.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = ({ params }) => {
	const result = readAttachmentFile(getDb(), params.id);
	if (result.isErr()) {
		return new Response(result.error.message, {
			status: result.error.status,
			headers: { "content-type": "text/plain; charset=utf-8" },
		});
	}
	const { attachment, data } = result.value;
	const name = attachment.file_name.replace(/["\\\r\n]/g, "_");
	const kind = attachmentKind(attachment.file_name, attachment.mime_type);
	const disposition = kind === "file" ? "attachment" : "inline";
	return new Response(new Uint8Array(data), {
		headers: {
			"content-type": attachment.mime_type ?? "application/octet-stream",
			"content-length": String(data.byteLength),
			"content-disposition": `${disposition}; filename="${name}"`,
			"cache-control": "no-store",
		},
	});
};

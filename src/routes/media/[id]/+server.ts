import { readAttachmentFile } from "#lib/server/attachments.ts";
import { getDb } from "#lib/server/db.ts";
import { mediaHeaders } from "#lib/server/media.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = ({ params }) => {
	const result = readAttachmentFile(getDb(), params.id);
	if (result.isErr()) {
		return new Response(result.error.message, {
			status: result.error.status,
			headers: {
				"content-type": "text/plain; charset=utf-8",
				"x-content-type-options": "nosniff",
			},
		});
	}
	const { attachment, data } = result.value;
	return new Response(new Uint8Array(data), {
		headers: {
			...mediaHeaders(attachment.file_name),
			"content-length": String(data.byteLength),
			"cache-control": "no-store",
		},
	});
};

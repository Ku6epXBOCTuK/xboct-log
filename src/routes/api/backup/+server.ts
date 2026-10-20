import { backupConfig, runBackup } from "#lib/server/backup.ts";
import { getDb } from "#lib/server/db.ts";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async () => {
	const result = await runBackup(getDb(), backupConfig(), "manual");
	if (result.isErr()) {
		return Response.json(
			{ ok: false, error: result.error.message },
			{ status: 500 },
		);
	}
	return Response.json({ ok: true, path: result.value });
};

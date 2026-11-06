import { dataFingerprint } from "#lib/server/paths.ts";
import { version } from "../../../../package.json";

const APP_NAME = "xboct-log";

export function GET() {
	const body: { ok: boolean; app: string; version: string; data?: string } = {
		ok: true,
		app: APP_NAME,
		version,
	};
	const data = dataFingerprint();
	if (data !== undefined) body.data = data;
	return new Response(JSON.stringify(body), {
		headers: { "content-type": "application/json" },
	});
}

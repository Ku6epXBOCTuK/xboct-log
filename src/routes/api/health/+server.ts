import { version } from "../../../../package.json";

const APP_NAME = "xboct-log";

export function GET() {
	return new Response(JSON.stringify({ ok: true, app: APP_NAME, version }), {
		headers: { "content-type": "application/json" },
	});
}

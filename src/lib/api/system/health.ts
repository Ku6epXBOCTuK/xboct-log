const HEALTH_URL = "/api/health";
const TIMEOUT_MS = 2_000;
const APP_NAME = "xboct-log";

export interface Health {
	ok: boolean;
	app: string;
	version: string;
	data?: string;
}

export async function getHealth(
	fetchImpl: typeof fetch = globalThis.fetch,
): Promise<Health> {
	const response = await fetchImpl(HEALTH_URL, {
		cache: "no-store",
		headers: { accept: "application/json" },
		signal: AbortSignal.timeout(TIMEOUT_MS),
	});
	if (!response.ok) {
		throw new Error(`the backend answered ${response.status}`);
	}
	const health = (await response.json()) as Partial<Health>;
	if (health.ok !== true || health.app !== APP_NAME) {
		throw new Error("the answer is not a health report of xboct-log");
	}
	return health as Health;
}

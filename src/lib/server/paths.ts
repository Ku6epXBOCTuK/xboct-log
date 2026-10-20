import { XBOCT_LOG_DB } from "$app/env/private";

export function defaultDbPath(): string {
	if (XBOCT_LOG_DB === undefined || XBOCT_LOG_DB === "") {
		throw new Error(
			"XBOCT_LOG_DB is not set. Add it to .env or the service environment.",
		);
	}
	return XBOCT_LOG_DB;
}

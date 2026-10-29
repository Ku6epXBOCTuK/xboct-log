import { XBOCT_LOG_DB } from "$app/env/private";
import { envString } from "./env";

export function defaultDbPath(): string {
	const value = envString("XBOCT_LOG_DB", XBOCT_LOG_DB);
	if (value === undefined || value === "") {
		throw new Error(
			"XBOCT_LOG_DB is not set. Start the app through the xboct-log launcher, or pass --data <dir>.",
		);
	}
	return value;
}

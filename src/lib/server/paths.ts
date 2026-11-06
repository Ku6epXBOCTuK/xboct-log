import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { XBOCT_LOG_DB } from "$app/env/private";
import { envString } from "./env";

export function fingerprintPath(path: string): string {
	const absolute = resolve(path).replace(/\\/g, "/");
	const normalized =
		process.platform === "win32" ? absolute.toLowerCase() : absolute;
	return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

export function dataFingerprint(): string | undefined {
	try {
		return fingerprintPath(dirname(defaultDbPath()));
	} catch {
		return undefined;
	}
}

export function defaultDbPath(): string {
	const value = envString("XBOCT_LOG_DB", XBOCT_LOG_DB);
	if (value === undefined || value === "") {
		throw new Error(
			"XBOCT_LOG_DB is not set. Start the app through the xboct-log launcher, or pass --data <dir>.",
		);
	}
	return value;
}

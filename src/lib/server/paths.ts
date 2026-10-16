import { homedir } from "node:os";
import { join } from "node:path";

export function defaultDbPath(): string {
	return (
		process.env.XBOCT_LOG_DB ?? join(homedir(), ".xboct-log", "xboct-log.db")
	);
}

import { homedir } from "node:os";
import { join } from "node:path";

export function defaultDbPath(): string {
	return process.env.BACKLOG_DB ?? join(homedir(), ".backlog", "backlog.db");
}

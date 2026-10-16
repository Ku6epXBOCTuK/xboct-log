import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const root = join(homedir(), ".xboct-log");
const env = {
	...process.env,
	XBOCT_LOG_DB: process.env.XBOCT_LOG_DB ?? join(root, "dev.db"),
	XBOCT_LOG_BACKUP_DIR:
		process.env.XBOCT_LOG_BACKUP_DIR ?? join(root, "dev-backups"),
	XBOCT_LOG_BACKUP_DISABLED: "1",
};

const child = spawn("pnpm", ["exec", "vite", "dev", "--port", "5173"], {
	stdio: "inherit",
	env,
	shell: true,
});
child.on("exit", (code) => process.exit(code ?? 0));

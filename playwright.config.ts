import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const ROOT = import.meta.dirname;
const E2E_DIR = join(ROOT, ".dev", "e2e");
mkdirSync(E2E_DIR, { recursive: true });
for (const entry of readdirSync(E2E_DIR)) {
	try {
		rmSync(join(E2E_DIR, entry), {
			recursive: true,
			force: true,
			maxRetries: 3,
		});
	} catch {
		// NOTE: windows keeps a lock on a database from a crashed run; unique ids keep the data usable
	}
}
mkdirSync(join(E2E_DIR, "backups"), { recursive: true });

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: false,
	workers: 1,
	timeout: 30_000,
	expect: { timeout: 10_000 },
	reporter: [["list"]],
	use: {
		baseURL: "http://127.0.0.1:5173",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		...devices["Desktop Chrome"],
	},
	webServer: {
		command: "node scripts/e2e/ui-server.mjs",
		url: "http://127.0.0.1:5173/api/health",
		reuseExistingServer: false,
		timeout: 180_000,
		stdout: "pipe",
		stderr: "pipe",
	},
});

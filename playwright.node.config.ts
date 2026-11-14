import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const ROOT = import.meta.dirname;
const E2E_DIR = join(ROOT, ".dev", "e2e");
const DB = join(E2E_DIR, "xboct-log.db");
mkdirSync(E2E_DIR, { recursive: true });
try {
	rmSync(DB, { force: true, maxRetries: 3 });
} catch {
	// NOTE: windows may keep the database locked from a crashed run
}

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
		extraHTTPHeaders: { "x-forwarded-proto": "http" },
	},
	webServer: {
		command: "node scripts/e2e/node-server.mjs",
		url: "http://127.0.0.1:5173/api/health",
		reuseExistingServer: false,
		timeout: 180_000,
		stdout: "pipe",
		stderr: "pipe",
	},
});

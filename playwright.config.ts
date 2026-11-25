import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
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

async function freePort() {
	return new Promise<number>((resolve, reject) => {
		const probe = createServer();
		probe.once("error", reject);
		probe.listen(0, "127.0.0.1", () => {
			const address = probe.address();
			if (address === null || typeof address === "string") {
				probe.close();
				reject(new Error("cannot pick an e2e port"));
				return;
			}
			probe.close(() => resolve(address.port));
		});
	});
}

// NOTE: the config is loaded in several processes; every one must use the same port
const PORT = Number(process.env.E2E_PORT ?? (await freePort()));
process.env.E2E_PORT = String(PORT);
const BASE = `http://127.0.0.1:${PORT}`;

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: false,
	workers: 1,
	timeout: 30_000,
	expect: { timeout: 10_000 },
	reporter: [["list"]],
	use: {
		baseURL: BASE,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		...devices["Desktop Chrome"],
	},
	webServer: {
		command: "node scripts/e2e/ui-server.mjs",
		url: `${BASE}/api/health`,
		env: { E2E_PORT: String(PORT) },
		reuseExistingServer: false,
		timeout: 180_000,
		stdout: "pipe",
		stderr: "pipe",
	},
});

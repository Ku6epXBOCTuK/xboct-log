import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
	ensureBinary,
	startServer,
	stopServer,
	waitForHealth,
} from "./lib/mcp.mjs";
import { databaseArg, seedData } from "./lib/seed.mjs";

const ROOT = join(import.meta.dirname, "..", "..");
const E2E = join(ROOT, ".dev", "e2e");
const PORT = Number(process.env.E2E_PORT ?? 5173);
const BUILD = join(ROOT, "build");

mkdirSync(E2E, { recursive: true });

function build() {
	if (existsSync(join(BUILD, "index.html"))) {
		return;
	}
	console.log("[e2e] building the spa");
	const result = spawnSync("pnpm", ["build"], {
		cwd: ROOT,
		stdio: "inherit",
		shell: true,
	});
	if (result.status !== 0) {
		throw new Error("pnpm build failed");
	}
}

const dataDir = join(E2E, "data");
const source = databaseArg();

ensureBinary();
build();

rmSync(dataDir, { recursive: true, force: true });
if (source) {
	console.log(`[e2e] seeding the server from ${source}`);
}
await seedData(dataDir, source);

const server = startServer({ port: PORT, dataDir, args: ["--web", BUILD] });

let closing = false;
function close() {
	if (closing) {
		return;
	}
	closing = true;
	stopServer(server, { keep: true });
}

process.on("SIGINT", () => {
	close();
	process.exit(0);
});
process.on("SIGTERM", () => {
	close();
	process.exit(0);
});
process.on("exit", close);

await waitForHealth(server.base);
console.log(`[e2e] ui on ${server.base}`);

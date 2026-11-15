import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dir = import.meta.dirname;
const config = JSON.parse(readFileSync(join(dir, "runtime.json"), "utf8"));
const rust = config.mode === "rust";
const command = rust ? config.command : process.execPath;
const args = rust ? config.args : [join(dir, "node-app.mjs")];

const child = spawn(command, args, {
	cwd: rust ? config.cwd : dir,
	stdio: "inherit",
	env: process.env,
});

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
	process.on(signal, () => {
		if (!child.killed) {
			child.kill(signal);
		}
	});
}

child.on("error", (error) => {
	console.error(`launcher: ${error.message}`);
	process.exit(1);
});

child.on("exit", (code) => {
	process.exit(code ?? 1);
});

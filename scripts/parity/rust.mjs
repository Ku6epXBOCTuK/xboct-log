import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { root, tmpDir } from "./lib.mjs";

function run(command, args) {
	const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
	if (result.error) throw result.error;
	return result.status ?? 1;
}

const out = join(tmpDir, "rust");

console.log("rust parity 1/3: seeding a clean node database");
const seeded = run(process.execPath, [
	join(root, "scripts", "parity", "seed.mjs"),
	"--out",
	join(tmpDir, "seed"),
]);
if (seeded !== 0) process.exit(seeded);

console.log("rust parity 2/3: capturing the rust side");
const captured = run("cargo", [
	"run",
	"--quiet",
	"--locked",
	"-p",
	"xboct-log-parity",
	"--",
	"--out",
	out,
]);

console.log("rust parity 3/3: comparing with the committed snapshots");
const compared = run(process.execPath, [
	join(root, "scripts", "parity", "compare.mjs"),
	"--actual",
	out,
	"--only",
	"db.json",
]);

process.exit(compared !== 0 ? compared : captured);

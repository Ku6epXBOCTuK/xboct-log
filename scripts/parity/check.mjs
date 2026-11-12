import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { root, tmpDir } from "./lib.mjs";

function run(script, args) {
	const result = spawnSync(
		process.execPath,
		[join(root, "scripts", "parity", script), ...args],
		{ cwd: root, stdio: "inherit" },
	);
	if (result.error) throw result.error;
	return result.status ?? 1;
}

function capture(dir) {
	rmSync(dir, { recursive: true, force: true });
	const status = run("capture.mjs", ["--out", dir]);
	if (status !== 0) process.exit(status);
}

const first = join(tmpDir, "check-a");
const second = join(tmpDir, "check-b");

console.log("check 1/3: capturing into the first scratch directory");
capture(first);
console.log("check 2/3: capturing again and comparing the two runs");
capture(second);
const deterministic = run("compare.mjs", [
	"--expected",
	first,
	"--actual",
	second,
]);
if (deterministic !== 0) process.exit(deterministic);

console.log("check 3/3: comparing the committed snapshots with this run");
process.exit(
	run("compare.mjs", [
		"--expected",
		"tests/parity/fixtures",
		"--actual",
		first,
	]),
);

import { spawnSync } from "node:child_process";

const steps = [
	{ label: "rustfmt", args: ["fmt", "--all", "--check"] },
	{
		label: "clippy",
		args: [
			"clippy",
			"--workspace",
			"--all-targets",
			"--locked",
			"--",
			"-D",
			"warnings",
		],
	},
	{ label: "tests", args: ["test", "--workspace", "--locked"] },
];

function run(args, { capture = false } = {}) {
	const result = spawnSync("cargo", args, {
		stdio: capture ? "pipe" : "inherit",
		encoding: "utf8",
	});
	if (result.error) throw result.error;
	return result;
}

for (const step of steps) {
	console.log(`rust check: ${step.label}`);
	const result = run(step.args);
	if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("rust check: sqlite is linked once");
const tree = run(["tree", "--workspace", "--duplicates", "--format", "{p}"], {
	capture: true,
});
if (tree.status !== 0) {
	console.error(tree.stderr);
	process.exit(tree.status ?? 1);
}
const duplicates = tree.stdout
	.split(/\r?\n/)
	.filter((line) => line.startsWith("libsqlite3-sys v"));
if (duplicates.length > 0) {
	console.error("more than one libsqlite3-sys in the dependency tree:");
	for (const line of duplicates) console.error(`  ${line}`);
	console.error("cargo tree --workspace --duplicates");
	process.exit(1);
}

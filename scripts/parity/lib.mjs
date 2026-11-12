import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
);
export const parityDir = join(root, "tests", "parity");
export const tmpDir = join(parityDir, ".tmp");

export function argumentValue(args, flag) {
	const index = args.indexOf(flag);
	if (index === -1) return undefined;
	const value = args[index + 1];
	if (value === undefined || value.startsWith("--")) {
		throw new Error(`${flag} needs a value`);
	}
	return value;
}

export function runVitest(specs, env = {}) {
	const files = Array.isArray(specs) ? specs : [specs];
	const result = spawnSync(
		"pnpm",
		["exec", "vitest", "run", "--project", "parity", ...files],
		{
			cwd: root,
			stdio: "inherit",
			shell: true,
			env: {
				...process.env,
				XBOCT_LOG_PARITY: "1",
				...env,
			},
		},
	);
	if (result.error) throw result.error;
	return result.status ?? 1;
}

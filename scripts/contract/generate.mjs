import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url)).replace(
	/[\\/]$/,
	"",
);
const check = process.argv.includes("--check");
const scratch = join(root, ".tmp", "contract");
const openapi = join(scratch, "openapi.json");
const types = join(root, "src", "lib", "api", "schema.d.ts");
const generated = check ? join(scratch, "schema.d.ts") : types;

mkdirSync(join(scratch, "src", "lib", "api"), { recursive: true });
execFileSync(
	"cargo",
	[
		"run",
		"--quiet",
		"--locked",
		"-p",
		"xboct-log-cli",
		"--",
		"--openapi",
		openapi,
	],
	{ cwd: root, stdio: ["ignore", "inherit", "inherit"] },
);
const cli = join(root, "node_modules", "openapi-typescript", "bin", "cli.js");
execFileSync(process.execPath, [cli, openapi, "-o", generated], {
	cwd: root,
	stdio: ["ignore", "inherit", "inherit"],
});

if (!check) {
	console.log("wrote src/lib/api/schema.d.ts");
} else {
	const fresh = existsSync(generated) ? readFileSync(generated, "utf8") : null;
	const committed = existsSync(types) ? readFileSync(types, "utf8") : null;
	rmSync(scratch, { recursive: true, force: true });
	if (fresh !== committed) {
		console.error(
			"src/lib/api/schema.d.ts does not match the operation registry, run pnpm contract:generate",
		);
		process.exit(1);
	}
	console.log("the frontend types match the operation registry");
}

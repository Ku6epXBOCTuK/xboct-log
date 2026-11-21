import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url)).replace(
	/[\\/]$/,
	"",
);
const scratch = join(root, ".tmp", "contract");
const openapi = join(scratch, "openapi.json");
const types = join(root, "src", "lib", "api", "schema.d.ts");

mkdirSync(scratch, { recursive: true });
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
execFileSync(process.execPath, [cli, openapi, "-o", types], {
	cwd: root,
	stdio: ["ignore", "inherit", "inherit"],
});
console.log("wrote src/lib/api/schema.d.ts");

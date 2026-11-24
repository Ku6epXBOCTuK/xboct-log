import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url)).replace(
	/[\\/]$/,
	"",
);
const scratch = join(root, ".tmp", "contract");
const openapi = join(scratch, "openapi.json");
const types = join(root, "src", "lib", "api", "schema.d.ts");
const enums = join(root, "src", "lib", "api", "enums.ts");

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

const schemas = JSON.parse(readFileSync(openapi, "utf8")).components.schemas;
const names = {
	Status: "STATUSES",
	Priority: "PRIORITIES",
	Estimate: "ESTIMATES",
	ClosedReason: "CLOSED_REASONS",
};
const lines = Object.entries(names).map(([schema, constant]) => {
	const values = schemas[schema]?.enum;
	if (!Array.isArray(values)) {
		throw new Error(
			`openapi.json: components.schemas.${schema}.enum is missing`,
		);
	}
	return `export const ${constant} = [${values.map((value) => JSON.stringify(value)).join(", ")}] as const;`;
});
writeFileSync(enums, `${lines.join("\n")}\n`);

console.log("wrote src/lib/api/schema.d.ts and src/lib/api/enums.ts");

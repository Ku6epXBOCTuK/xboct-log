import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
	console.error("usage: node scripts/bump-version.mjs <version>");
	process.exit(1);
}

const root = fileURLToPath(new URL("..", import.meta.url)).replace(
	/[\\/]$/,
	"",
);

function replace(path, pattern, label) {
	const file = new URL(path, import.meta.url);
	const content = readFileSync(file, "utf8");
	const updated = content.replace(pattern, `$1${version}$2`);
	if (updated === content && !content.includes(`version = "${version}"`)) {
		throw new Error(`no ${label} to update in ${path}`);
	}
	writeFileSync(file, updated);
	console.log(`${path.slice(3)} -> ${version}`);
}

for (const file of ["../package.json", "../vscode-extension/package.json"]) {
	const path = new URL(file, import.meta.url);
	const pkg = JSON.parse(readFileSync(path, "utf8"));
	pkg.version = version;
	writeFileSync(path, `${JSON.stringify(pkg, null, "\t")}\n`);
	console.log(`${file.slice(3)} -> ${version}`);
}

replace("../Cargo.toml", /^(version = ")[^"]+(")$/m, "workspace version");

execFileSync("cargo", ["update", "--workspace", "--offline"], {
	cwd: root,
	stdio: "inherit",
});

execFileSync(
	"cargo",
	["metadata", "--locked", "--offline", "--format-version", "1"],
	{ cwd: root, stdio: "ignore" },
);
const metadata = JSON.parse(
	execFileSync(
		"cargo",
		["metadata", "--locked", "--offline", "--no-deps", "--format-version", "1"],
		{
			cwd: root,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "inherit"],
		},
	),
);
const stale = metadata.packages.filter((pkg) => pkg.version !== version);
if (stale.length > 0) {
	throw new Error(
		`Cargo.lock has stale workspace crates: ${stale.map((pkg) => `${pkg.name} ${pkg.version}`).join(", ")}`,
	);
}
console.log(`Cargo.lock -> ${version}`);

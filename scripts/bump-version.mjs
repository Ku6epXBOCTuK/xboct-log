import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
	console.error("usage: node scripts/bump-version.mjs <version>");
	process.exit(1);
}

function replace(path, pattern, label) {
	const file = new URL(path, import.meta.url);
	const content = readFileSync(file, "utf8");
	const updated = content.replace(pattern, `$1${version}$2`);
	if (updated === content && !content.includes(version)) {
		throw new Error(`no ${label} to update in ${path}`);
	}
	writeFileSync(file, updated);
	console.log(`${path} -> ${version}`);
}

for (const file of ["../package.json", "../vscode-extension/package.json"]) {
	const path = new URL(file, import.meta.url);
	const pkg = JSON.parse(readFileSync(path, "utf8"));
	pkg.version = version;
	writeFileSync(path, `${JSON.stringify(pkg, null, "\t")}\n`);
	console.log(`${file.slice(3)} -> ${version}`);
}

replace("../Cargo.toml", /^(version = ")[^"]+(")$/m, "workspace version");
replace(
	"../Cargo.lock",
	/(name = "xboct-log-[a-z]+"\r?\nversion = ")[^"]+(")/g,
	"workspace crates",
);

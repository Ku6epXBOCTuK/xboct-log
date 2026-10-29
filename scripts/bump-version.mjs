import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
	console.error("usage: node scripts/bump-version.mjs <version>");
	process.exit(1);
}

const files = ["../package.json", "../vscode-extension/package.json"];

for (const file of files) {
	const path = new URL(file, import.meta.url);
	const pkg = JSON.parse(readFileSync(path, "utf8"));
	pkg.version = version;
	writeFileSync(path, `${JSON.stringify(pkg, null, "\t")}\n`);
	console.log(`${file.slice(3)} -> ${version}`);
}

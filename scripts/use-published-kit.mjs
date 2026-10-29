import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
	console.error("usage: node scripts/use-published-kit.mjs <version>");
	process.exit(1);
}

const path = new URL("../package.json", import.meta.url);
const pkg = JSON.parse(readFileSync(path, "utf8"));

pkg.devDependencies["@ku6epxboctuk/ui-kit"] = version;
writeFileSync(path, `${JSON.stringify(pkg, null, "\t")}\n`);
console.log(`@ku6epxboctuk/ui-kit -> ${version}`);

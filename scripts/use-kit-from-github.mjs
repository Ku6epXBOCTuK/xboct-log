import { readFileSync, writeFileSync } from "node:fs";

const specifier = "github:Ku6epXBOCTuK/ui-kit#main";
const path = new URL("../package.json", import.meta.url);
const pkg = JSON.parse(readFileSync(path, "utf8"));

pkg.devDependencies["@ku6epxboctuk/ui-kit"] = specifier;
writeFileSync(path, `${JSON.stringify(pkg, null, "\t")}\n`);
console.log(`@ku6epxboctuk/ui-kit -> ${specifier}`);

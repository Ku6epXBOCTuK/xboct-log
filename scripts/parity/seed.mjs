import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { argumentValue, root, runVitest } from "./lib.mjs";

const args = process.argv.slice(2);
const out = resolve(
	root,
	argumentValue(args, "--out") ?? "tests/parity/fixtures",
);

mkdirSync(out, { recursive: true });
console.log(`seeding the database and capturing it into ${out}`);

process.exit(
	runVitest("tests/parity/seed.node.spec.ts", { XBOCT_LOG_PARITY_OUT: out }),
);

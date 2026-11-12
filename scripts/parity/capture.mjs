import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { argumentValue, root, runVitest } from "./lib.mjs";

const args = process.argv.slice(2);
const out = resolve(
	root,
	argumentValue(args, "--out") ?? "tests/parity/fixtures",
);

mkdirSync(out, { recursive: true });
console.log(`seeding the database and capturing the node contract into ${out}`);

const env = { XBOCT_LOG_PARITY_OUT: out };
const seeded = runVitest("tests/parity/seed.node.spec.ts", env);
if (seeded !== 0) {
	process.exit(seeded);
}
const contract = runVitest("tests/parity/capture.node.spec.ts", env);
if (contract !== 0) {
	process.exit(contract);
}
process.exit(runVitest("tests/parity/ops.node.spec.ts", env));

import {
	cpSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { diffJson } from "../../tests/parity/lib/diff.mjs";
import { argumentValue, root, tmpDir } from "./lib.mjs";

const MAX_REPORTED = 50;

function jsonFiles(dir) {
	return readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
		.map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1))
		.sort();
}

function selection(value) {
	const selected = new Map();
	for (const entry of value.split(",")) {
		const [file, ...keys] = entry.split("#");
		selected.set(file.trim(), keys.length === 0 ? null : keys);
	}
	return selected;
}

function compareDirs(expectedDir, actualDir, only) {
	const expectedFiles = jsonFiles(expectedDir);
	const actualFiles = jsonFiles(actualDir);
	const seen = new Set(actualFiles);
	const lines = [];
	const files = only === undefined ? expectedFiles : [...only.keys()];

	for (const file of files) {
		if (!seen.has(file)) {
			lines.push(`${file}: missing in actual`);
			continue;
		}
		let expected = JSON.parse(readFileSync(join(expectedDir, file), "utf8"));
		let actual = JSON.parse(readFileSync(join(actualDir, file), "utf8"));
		const keys = only?.get(file);
		if (keys !== null && keys !== undefined) {
			const absent = keys.filter((key) => !(key in actual));
			if (absent.length > 0) {
				lines.push(`${file}: ${absent.join(", ")} missing in actual`);
				continue;
			}
			const pick = (document) =>
				Object.fromEntries(
					keys
						.filter((key) => key in document)
						.map((key) => [key, document[key]]),
				);
			expected = pick(expected);
			actual = pick(actual);
		}
		for (const line of diffJson(expected, actual)) {
			lines.push(`${file}: ${line}`);
		}
	}
	if (only === undefined) {
		for (const file of actualFiles) {
			if (!expectedFiles.includes(file)) lines.push(`${file}: only in actual`);
		}
	}
	return lines;
}

function report(lines) {
	console.error(`contract mismatch: ${lines.length} difference(s)`);
	for (const line of lines.slice(0, MAX_REPORTED)) console.error(`  ${line}`);
	if (lines.length > MAX_REPORTED) {
		console.error(`  ... ${lines.length - MAX_REPORTED} more`);
	}
}

function selfTest(expectedDir) {
	const scratch = join(tmpDir, "self-test");
	rmSync(scratch, { recursive: true, force: true });
	cpSync(expectedDir, scratch, { recursive: true });

	const file = jsonFiles(scratch)[0];
	if (file === undefined) {
		throw new Error("self-test needs at least one contract file");
	}
	const target = join(scratch, file);
	const document = JSON.parse(readFileSync(target, "utf8"));
	const firstKey = Object.keys(document)[0];
	if (firstKey === undefined) {
		throw new Error(`self-test cannot mutate ${file}: no keys`);
	}
	document[firstKey] = { corrupted: true };
	writeFileSync(target, JSON.stringify(document, null, 2));

	const lines = compareDirs(expectedDir, scratch);
	rmSync(scratch, { recursive: true, force: true });

	if (lines.length === 0) {
		throw new Error("compare reported no difference for a corrupted contract");
	}
	console.log(
		`self-test ok: corrupted ${file} produced ${lines.length} difference(s)`,
	);
	process.exit(0);
}

const args = process.argv.slice(2);
const expectedDir = resolve(
	root,
	argumentValue(args, "--expected") ?? "tests/parity/fixtures",
);
const actualDir = resolve(
	root,
	argumentValue(args, "--actual") ?? "tests/parity/.tmp/rust",
);
const onlyValue = argumentValue(args, "--only");
const only = onlyValue === undefined ? undefined : selection(onlyValue);

if (args.includes("--self-test")) {
	selfTest(expectedDir);
}

if (jsonFiles(expectedDir).length === 0) {
	console.error(
		`no contract files in ${expectedDir}; run pnpm parity:capture first`,
	);
	process.exit(1);
}

const lines = compareDirs(expectedDir, actualDir, only);
if (lines.length > 0) {
	report(lines);
	process.exit(1);
}
console.log(
	`contracts match: ${only === undefined ? jsonFiles(expectedDir).length : only.size} file(s)`,
);

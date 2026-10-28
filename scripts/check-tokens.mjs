import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const kitTokens = join(
	root,
	"node_modules",
	"@ku6epxboctuk",
	"ui-kit",
	"tokens",
);

function tokenNames(...files) {
	const names = new Set();
	for (const file of files) {
		const css = readFileSync(join(kitTokens, file), "utf8");
		for (const match of css.matchAll(/--ui-[a-z0-9-]+(?=\s*:)/g)) {
			names.add(match[0]);
		}
	}
	return names;
}

function walk(dir) {
	const out = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) out.push(...walk(full));
		else if (/\.(svelte|css|ts)$/.test(entry)) out.push(full);
	}
	return out;
}

const known = tokenNames("tool.css", "kawaii.css");
const files = walk(join(root, "src"));
const problems = [];
let references = 0;

for (const file of files) {
	const text = readFileSync(file, "utf8");
	const rel = relative(root, file).replaceAll("\\", "/");

	for (const match of text.matchAll(/var\(\s*(--ui-[a-z0-9-]+)/g)) {
		references += 1;
		if (!known.has(match[1])) {
			problems.push(`${rel}: unknown token ${match[1]}`);
		}
	}

	if (rel === "src/app.css") continue;
	for (const match of text.matchAll(/^\s*(--ui-[a-z0-9-]+)\s*:/gm)) {
		problems.push(
			`${rel}: defines ${match[1]}, only src/app.css may override kit tokens`,
		);
	}
}

if (problems.length > 0) {
	console.error(problems.join("\n"));
	console.error(`\nToken check failed: ${problems.length} problem(s).`);
	process.exit(1);
}

console.log(
	`Token check: ${known.size} kit tokens, ${references} references resolved.`,
);

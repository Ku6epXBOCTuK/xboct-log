import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { root } from "./lib.mjs";

const contract = JSON.parse(
	readFileSync(
		join(root, "tests", "parity", "fixtures", "contract.json"),
		"utf8",
	),
);

const tools = contract.mcp.tools.tools;
const entries = tools
	.map(
		(tool) =>
			`    (${JSON.stringify(tool.name)}, ${JSON.stringify(
				JSON.stringify(tool.inputSchema),
			)}, ${JSON.stringify(JSON.stringify(tool.outputSchema ?? null))}),`,
	)
	.join("\n");

const source = `pub const TOOLS: [(&str, &str, &str); ${tools.length}] = [
${entries}
];
`;

writeFileSync(join(root, "crates", "ops", "src", "schemas.rs"), source);
console.log(`wrote ${tools.length} tool schemas`);

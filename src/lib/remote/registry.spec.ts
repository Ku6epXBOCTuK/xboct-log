import { describe, expect, it } from "vitest";
import { z } from "zod";
import { getOps } from "#lib/remote/index.ts";

describe("input contracts", () => {
	interface JsonSchemaNode {
		description?: string;
		properties?: Record<string, JsonSchemaNode>;
		items?: JsonSchemaNode;
		anyOf?: JsonSchemaNode[];
	}

	function findEpicId(node: JsonSchemaNode): JsonSchemaNode | undefined {
		const direct = node.properties?.epic_id;
		if (direct) {
			return direct;
		}
		for (const child of Object.values(node.properties ?? {})) {
			const found = findEpicId(child);
			if (found) {
				return found;
			}
		}
		return node.items ? findEpicId(node.items) : undefined;
	}

	function epicIdDescription(name: string): string {
		const root = z.toJSONSchema(getOps().get(name)!.input!, {
			reused: "inline",
		}) as JsonSchemaNode;
		const node = findEpicId(root);
		return node?.description ?? node?.anyOf?.[0]?.description ?? "";
	}

	it("documents that epics are flat on every epic_id field", () => {
		for (const name of [
			"tasks_create",
			"tasks_create_many",
			"tasks_update",
			"tasks_update_many",
		]) {
			expect(epicIdDescription(name), `${name} epic_id`).toContain(
				"Epics are flat",
			);
		}
	});
});

describe("output contracts", () => {
	it("declares an output schema for every op", () => {
		for (const [name, op] of getOps()) {
			expect(op.output, `${name} has no output schema`).toBeDefined();
		}
	});

	it("publishes a JSON Schema root that the MCP spec accepts", () => {
		for (const [name, op] of getOps()) {
			const schema = z.toJSONSchema(op.output!);
			expect(schema.type, `${name} has a ${schema.type} root`).toBe("object");
		}
	});
});

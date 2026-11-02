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

	function findProperty(
		node: JsonSchemaNode,
		field: string,
	): JsonSchemaNode | undefined {
		const direct = node.properties?.[field];
		if (direct) {
			return direct;
		}
		for (const child of Object.values(node.properties ?? {})) {
			const found = findProperty(child, field);
			if (found) {
				return found;
			}
		}
		for (const variant of node.anyOf ?? []) {
			const found = findProperty(variant, field);
			if (found) {
				return found;
			}
		}
		return node.items ? findProperty(node.items, field) : undefined;
	}

	function fieldDescription(name: string, field: string): string {
		const root = z.toJSONSchema(getOps().get(name)!.input!, {
			reused: "inline",
		}) as JsonSchemaNode;
		const node = findProperty(root, field);
		return node?.description ?? node?.anyOf?.[0]?.description ?? "";
	}

	it("documents that epics are flat on every epic_id field", () => {
		for (const name of [
			"tasks_create",
			"tasks_create_many",
			"tasks_update",
			"tasks_update_many",
		]) {
			expect(fieldDescription(name, "epic_id"), `${name} epic_id`).toContain(
				"Epics are flat",
			);
		}
	});

	it("documents markdown on every description and comment body field", () => {
		for (const name of [
			"tasks_create",
			"tasks_create_many",
			"tasks_update",
			"tasks_update_many",
		]) {
			expect(
				fieldDescription(name, "description"),
				`${name} description`,
			).toContain("Markdown");
		}
		for (const name of ["tasks_comments_add", "tasks_comments_edit"]) {
			expect(fieldDescription(name, "body"), `${name} body`).toContain(
				"Markdown",
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

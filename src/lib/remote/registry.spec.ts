import { describe, expect, it } from "vitest";
import { z } from "zod";
import { getOps } from "./index.js";

describe("remote op registry", () => {
	it("registers operations", () => {
		expect(getOps().size).toBeGreaterThan(0);
	});

	it("every op has a name matching its key, a description and a schema", () => {
		for (const [name, op] of getOps()) {
			expect(op.name).toBe(name);
			expect(op.description.length).toBeGreaterThan(0);
			expect(["query", "command"]).toContain(op.kind);
			expect(typeof op.input.parse).toBe("function");
		}
	});

	it("every input schema converts to a JSON Schema object", () => {
		for (const op of getOps().values()) {
			const json = z.toJSONSchema(op.input, { io: "input" });
			expect(json.type).toBe("object");
		}
	});

	it("tasks_list applies a default limit of 100", () => {
		const op = getOps().get("tasks_list");
		const input = op?.input as unknown as {
			parse: (value: unknown) => { limit?: number };
		};
		expect(input.parse({}).limit).toBe(100);
	});
});

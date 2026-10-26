import { describe, expect, it } from "vitest";
import { z } from "zod";
import { getOps } from "#lib/remote/index.ts";

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

	it("keeps the published output schemas small", () => {
		let size = 0;
		for (const op of getOps().values()) {
			size += JSON.stringify(z.toJSONSchema(op.output!)).length;
		}
		expect(size).toBeLessThanOrEqual(20_000);
	});
});

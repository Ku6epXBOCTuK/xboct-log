import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { fingerprintPath } from "./paths";

describe("fingerprintPath", () => {
	it("returns 16 hex characters", () => {
		expect(fingerprintPath("data")).toMatch(/^[0-9a-f]{16}$/);
	});

	it("treats a relative path as absolute", () => {
		expect(fingerprintPath("data")).toBe(fingerprintPath(resolve("data")));
	});

	it("differs for different folders", () => {
		expect(fingerprintPath("data/a")).not.toBe(fingerprintPath("data/b"));
	});
});

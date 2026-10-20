import { describe, expect, it } from "vitest";
import { envBool, envInt } from "./env";

describe("env parsing", () => {
	it("parses integers with a fallback", () => {
		expect(envInt("5", 3)).toBe(5);
		expect(envInt("", 3)).toBe(3);
		expect(envInt(undefined, 3)).toBe(3);
		expect(envInt("abc", 3)).toBe(3);
	});

	it("treats 1, true and yes as true", () => {
		expect(envBool("1")).toBe(true);
		expect(envBool("true")).toBe(true);
		expect(envBool("yes")).toBe(true);
		expect(envBool("0")).toBe(false);
		expect(envBool(undefined)).toBe(false);
	});
});

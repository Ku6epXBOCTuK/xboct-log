import { describe, expect, it } from "vitest";
import { isTaskId } from "#lib/tasks/route.ts";

describe("isTaskId", () => {
	it("accepts a full uppercase id", () => {
		expect(isTaskId("LOG-42")).toBe(true);
	});

	it("accepts a lowercase prefix", () => {
		expect(isTaskId("inb-7")).toBe(true);
	});

	it("rejects a bare number", () => {
		expect(isTaskId("42")).toBe(false);
	});

	it("rejects a missing number", () => {
		expect(isTaskId("LOG-")).toBe(false);
	});

	it("rejects a prefix longer than six characters", () => {
		expect(isTaskId("ABCDEFG-1")).toBe(false);
	});

	it("rejects a path", () => {
		expect(isTaskId("/tasks/LOG-42")).toBe(false);
	});
});

import { describe, expect, it } from "vitest";
import { scopeChoices, scopeIdOf, scopeNameError } from "./scopes";

describe("scope choices", () => {
	it("starts with the empty choice and lists the scopes", () => {
		const choices = scopeChoices([
			{ id: 3, name: "bug" },
			{ id: 7, name: "chore" },
		]);

		expect(choices).toEqual([
			{ key: "", label: "not selected" },
			{ key: "3", label: "bug" },
			{ key: "7", label: "chore" },
		]);
	});

	it("has only the empty choice when the project has no scopes", () => {
		expect(scopeChoices([])).toEqual([{ key: "", label: "not selected" }]);
	});
});

describe("scope id", () => {
	it("reads the id of a scope and treats the empty choice as no scope", () => {
		expect(scopeIdOf({ key: "12", label: "bug" })).toBe(12);
		expect(scopeIdOf({ key: "", label: "not selected" })).toBeNull();
	});
});

describe("scope name", () => {
	it("rejects a blank name and accepts a trimmed one", () => {
		expect(scopeNameError("   ")).toBe("Enter a scope name");
		expect(scopeNameError("bug")).toBeNull();
	});
});

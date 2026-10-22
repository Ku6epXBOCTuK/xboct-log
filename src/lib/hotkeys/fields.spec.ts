import { describe, expect, it } from "vitest";
import { isTextarea, isTextInput, nextField } from "./fields";

function field(tagName: string, type?: string) {
	return { tagName, type };
}

describe("isTextInput", () => {
	it("accepts single line inputs", () => {
		expect(isTextInput(field("INPUT", "text"))).toBe(true);
		expect(isTextInput(field("input", "date"))).toBe(true);
		expect(isTextInput(field("INPUT"))).toBe(true);
	});

	it("rejects other controls", () => {
		expect(isTextInput(field("TEXTAREA"))).toBe(false);
		expect(isTextInput(field("INPUT", "checkbox"))).toBe(false);
		expect(isTextInput(field("SELECT"))).toBe(false);
	});
});

describe("isTextarea", () => {
	it("detects textareas", () => {
		expect(isTextarea(field("TEXTAREA"))).toBe(true);
		expect(isTextarea(field("INPUT", "text"))).toBe(false);
	});
});

describe("nextField", () => {
	it("skips the controls that are not fields", () => {
		const fields = [
			field("INPUT", "text"),
			field("BUTTON"),
			field("INPUT", "checkbox"),
			field("TEXTAREA"),
		];
		expect(nextField(fields, fields[0])).toBe(fields[3]);
	});

	it("returns nothing after the last field", () => {
		const fields = [field("INPUT", "text"), field("TEXTAREA")];
		expect(nextField(fields, fields[1])).toBeNull();
	});

	it("ignores a target that is not in the list", () => {
		expect(
			nextField([field("INPUT", "text")], field("INPUT", "text")),
		).toBeNull();
	});
});

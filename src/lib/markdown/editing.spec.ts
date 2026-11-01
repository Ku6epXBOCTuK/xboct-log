import { describe, expect, it } from "vitest";
import { indentSelection } from "./editing";

function indent(source: string, start = 0, end = start) {
	return indentSelection(source, start, end, false);
}

function outdent(source: string, start = 0, end = start) {
	return indentSelection(source, start, end, true);
}

describe("indentSelection", () => {
	it("inserts two spaces at a bare caret", () => {
		expect(indent("code", 2, 2)).toEqual({ value: "co  de", start: 4, end: 4 });
	});

	it("indents every selected line", () => {
		expect(indent("one\ntwo", 0, 7)).toEqual({
			value: "  one\n  two",
			start: 0,
			end: 11,
		});
	});

	it("leaves the line after a trailing newline alone", () => {
		const edit = indent("one\ntwo", 0, 4);
		expect(edit?.value).toBe("  one\ntwo");
		expect(edit?.end).toBe(6);
	});

	it("outdents a single line from the caret", () => {
		expect(outdent("  item", 4, 4)).toEqual({
			value: "item",
			start: 2,
			end: 2,
		});
	});

	it("outdents a tab and a single space", () => {
		expect(outdent("\titem", 0, 0)?.value).toBe("item");
		expect(outdent(" item", 0, 0)?.value).toBe("item");
	});

	it("outdents every selected line", () => {
		expect(outdent("  one\n  two", 0, 11)).toEqual({
			value: "one\ntwo",
			start: 0,
			end: 7,
		});
	});

	it("does nothing when no line is indented", () => {
		expect(outdent("one\ntwo", 0, 7)).toBeNull();
	});
});

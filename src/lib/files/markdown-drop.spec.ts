import { describe, expect, it } from "vitest";
import {
	appendMarkdown,
	isMarkdownFile,
	joinMarkdown,
	readMarkdown,
} from "./markdown-drop.ts";

function file(name: string, type = "", content = ""): File {
	return new File([content], name, { type });
}

describe("isMarkdownFile", () => {
	it("accepts markdown extensions", () => {
		expect(isMarkdownFile(file("notes.md"))).toBe(true);
		expect(isMarkdownFile(file("NOTES.MD"))).toBe(true);
		expect(isMarkdownFile(file("notes.markdown"))).toBe(true);
	});

	it("accepts markdown mime types", () => {
		expect(isMarkdownFile(file("notes.txt", "text/markdown"))).toBe(true);
		expect(isMarkdownFile(file("notes", "text/x-markdown"))).toBe(true);
	});

	it("rejects other files", () => {
		expect(isMarkdownFile(file("photo.png", "image/png"))).toBe(false);
		expect(isMarkdownFile(file("readme.txt", "text/plain"))).toBe(false);
		expect(isMarkdownFile(file("archive.md.zip", "application/zip"))).toBe(
			false,
		);
	});
});

describe("appendMarkdown", () => {
	it("returns the current text when nothing arrives", () => {
		expect(appendMarkdown("old", "   \n ")).toBe("old");
	});

	it("returns the arriving text when the field is empty", () => {
		expect(appendMarkdown("", "# New")).toBe("# New");
		expect(appendMarkdown("  \n", "# New")).toBe("# New");
	});

	it("appends after a blank line and trims the tail", () => {
		expect(appendMarkdown("old\n\n\n", "new\n")).toBe("old\n\nnew");
	});
});

describe("joinMarkdown", () => {
	it("separates several documents with a blank line", () => {
		expect(joinMarkdown(["# A\n", "# B", " "])).toBe("# A\n\n# B");
	});

	it("returns an empty string when every document is empty", () => {
		expect(joinMarkdown(["", "  "])).toBe("");
	});
});

describe("readMarkdown", () => {
	it("reads only markdown files and joins them", async () => {
		const text = await readMarkdown([
			file("a.md", "text/markdown", "# A"),
			file("photo.png", "image/png", "binary"),
			file("b.markdown", "", "# B"),
		]);

		expect(text).toBe("# A\n\n# B");
	});
});

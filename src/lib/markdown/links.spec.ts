import { describe, expect, it } from "vitest";
import { classifyLink, repoPath } from "./links";

const base = "http://127.0.0.1:45881/tasks/LOG-44";

describe("classifyLink", () => {
	it("treats absolute http and https links as external", () => {
		expect(classifyLink("https://example.com/a?b=1", base)).toBe("external");
		expect(classifyLink("http://example.com", base)).toBe("external");
	});

	it("treats mailto links as external", () => {
		expect(classifyLink("mailto:someone@example.com", base)).toBe("external");
	});

	it("treats same-origin media links as media", () => {
		expect(classifyLink("/media/abc", base)).toBe("media");
		expect(classifyLink("http://127.0.0.1:45881/media/abc", base)).toBe(
			"media",
		);
	});

	it("treats same-origin pages outside the media folder as files", () => {
		expect(classifyLink("/docs/notes.md", base)).toBe("file");
		expect(classifyLink("./docs/notes.md", base)).toBe("file");
		expect(classifyLink("http://127.0.0.1:45881/docs/notes.md", base)).toBe(
			"file",
		);
	});

	it("ignores anchors to the current page and empty links", () => {
		expect(classifyLink("#section", base)).toBe("ignore");
		expect(classifyLink(`${base}#section`, base)).toBe("ignore");
		expect(classifyLink("   ", base)).toBe("ignore");
	});

	it("ignores unsafe protocols", () => {
		expect(classifyLink("javascript:alert(1)", base)).toBe("ignore");
		expect(classifyLink("file:///etc/passwd", base)).toBe("ignore");
		expect(classifyLink("data:text/html,hi", base)).toBe("ignore");
	});
});

describe("repoPath", () => {
	it("keeps a path relative to the repository root", () => {
		expect(repoPath("./docs/notes.md")).toBe("docs/notes.md");
		expect(repoPath("docs/notes.md")).toBe("docs/notes.md");
		expect(repoPath("/docs/notes.md")).toBe("docs/notes.md");
	});

	it("drops the query, the fragment and the trailing slash", () => {
		expect(repoPath("docs/notes.md?raw=1")).toBe("docs/notes.md");
		expect(repoPath("docs/notes.md#intro")).toBe("docs/notes.md");
		expect(repoPath("docs/")).toBe("docs");
	});

	it("decodes escaped characters", () => {
		expect(repoPath("docs/my%20notes.md")).toBe("docs/my notes.md");
	});

	it("refuses paths that leave the repository", () => {
		expect(repoPath("../../etc/passwd")).toBeNull();
		expect(repoPath("docs/../../secret")).toBeNull();
		expect(repoPath("docs/%2E%2E/secret")).toBeNull();
	});

	it("refuses empty paths, anchors and windows drives", () => {
		expect(repoPath("")).toBeNull();
		expect(repoPath("#intro")).toBeNull();
		expect(repoPath("./")).toBeNull();
		expect(repoPath("C:/Windows/system32")).toBeNull();
	});
});

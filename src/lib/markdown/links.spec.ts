import { describe, expect, it } from "vitest";
import { classifyLink } from "./links";

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

	it("ignores same-origin pages outside the media folder", () => {
		expect(classifyLink("/tasks/LOG-44", base)).toBe("ignore");
		expect(classifyLink("http://127.0.0.1:45881/tasks/LOG-44", base)).toBe(
			"ignore",
		);
	});

	it("ignores relative paths, anchors and empty links", () => {
		expect(classifyLink("other.md", base)).toBe("ignore");
		expect(classifyLink("#section", base)).toBe("ignore");
		expect(classifyLink("   ", base)).toBe("ignore");
	});

	it("ignores unsafe protocols", () => {
		expect(classifyLink("javascript:alert(1)", base)).toBe("ignore");
		expect(classifyLink("file:///etc/passwd", base)).toBe("ignore");
		expect(classifyLink("data:text/html,hi", base)).toBe("ignore");
	});
});

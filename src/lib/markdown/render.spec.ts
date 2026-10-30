import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./render";

describe("renderMarkdown", () => {
	it("returns nothing for blank input", () => {
		expect(renderMarkdown("")).toBe("");
		expect(renderMarkdown("   \n\t ")).toBe("");
	});

	it("renders headings", () => {
		expect(renderMarkdown("# Title")).toContain("<h1>Title</h1>");
		expect(renderMarkdown("### Third")).toContain("<h3>Third</h3>");
	});

	it("renders emphasis", () => {
		expect(renderMarkdown("**bold**")).toContain("<strong>bold</strong>");
		expect(renderMarkdown("_italic_")).toContain("<em>italic</em>");
	});

	it("renders bullet and ordered lists", () => {
		const bullets = renderMarkdown("- one\n- two");
		expect(bullets).toContain("<ul>");
		expect(bullets).toContain("<li>one</li>");

		const ordered = renderMarkdown("1. one\n2. two");
		expect(ordered).toContain("<ol>");
		expect(ordered).toContain("<li>two</li>");
	});

	it("renders fenced code with its language", () => {
		const html = renderMarkdown("```ts\nconst a = 1;\n```");
		expect(html).toContain('<code class="language-ts">');
		expect(html).toContain("const a = 1;");
	});

	it("escapes raw html instead of rendering it", () => {
		const html = renderMarkdown("<script>alert(1)</script>");
		expect(html).not.toContain("<script>");
		expect(html).toContain("&lt;script&gt;");
	});

	it("drops links with an unsafe protocol", () => {
		const html = renderMarkdown("[click](javascript:alert(1))");
		expect(html).not.toContain("<a ");
		expect(html).not.toContain("href");
	});

	it("opens external links in a new tab", () => {
		const html = renderMarkdown("[site](https://example.com/a?b=1&c=2)");
		expect(html).toContain('href="https://example.com/a?b=1&amp;c=2"');
		expect(html).toContain('target="_blank"');
		expect(html).toContain('rel="noopener noreferrer"');
	});

	it("keeps internal links in the same tab", () => {
		const html = renderMarkdown("[media](/media/abc)");
		expect(html).toContain('href="/media/abc"');
		expect(html).not.toContain("target=");
	});

	it("linkifies bare urls", () => {
		expect(renderMarkdown("see https://example.com")).toContain(
			'href="https://example.com"',
		);
	});
});

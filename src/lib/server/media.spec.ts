import { describe, expect, it } from "vitest";
import { MEDIA_CONTENT_SECURITY_POLICY, mediaHeaders } from "./media.ts";

describe("mediaHeaders", () => {
	it("derives the type from the extension", () => {
		expect(mediaHeaders("photo.png")["content-type"]).toBe("image/png");
		expect(mediaHeaders("note.txt")["content-type"]).toBe("text/plain");
		expect(mediaHeaders("dump.zip")["content-type"]).toBe("application/zip");
	});

	it("never trusts a name that only looks like an image", () => {
		const headers = mediaHeaders("page.html");
		expect(headers["content-type"]).toBe("application/octet-stream");
		expect(headers["content-disposition"]).toContain("attachment");
	});

	it("opens images, text and pdf on the page and downloads the rest", () => {
		for (const name of ["photo.png", "note.md", "report.pdf"]) {
			expect(mediaHeaders(name)["content-disposition"]).toContain("inline");
		}
		for (const name of ["dump.zip", "report.docx", "page.html"]) {
			expect(mediaHeaders(name)["content-disposition"]).toContain("attachment");
		}
	});

	it("sandboxes the documents the browser renders", () => {
		expect(mediaHeaders("note.txt")["content-security-policy"]).toBe(
			MEDIA_CONTENT_SECURITY_POLICY,
		);
		expect(mediaHeaders("photo.png")["content-security-policy"]).toBe(
			MEDIA_CONTENT_SECURITY_POLICY,
		);
		expect(
			mediaHeaders("report.pdf")["content-security-policy"],
		).toBeUndefined();
	});

	it("forbids sniffing everywhere", () => {
		for (const name of ["photo.png", "note.txt", "page.html", "no-extension"]) {
			expect(mediaHeaders(name)["x-content-type-options"]).toBe("nosniff");
		}
	});

	it("keeps a hostile file name inside the quoted header", () => {
		const headers = mediaHeaders('bad"name\r\nx: y.png');
		expect(headers["content-disposition"]).toBe(
			'inline; filename="bad_name__x: y.png"',
		);
	});
});

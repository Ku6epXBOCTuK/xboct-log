import { describe, expect, it } from "vitest";
import {
	ATTACHMENT_ACCEPT,
	attachmentFormat,
	attachmentKind,
	extensionOf,
	filterFiles,
	rejectionMessage,
} from "./attachment-kinds.ts";

function file(name: string, type = "", content = ""): File {
	return new File([content], name, { type });
}

describe("extensionOf", () => {
	it("lowercases the last extension", () => {
		expect(extensionOf("Photo.PNG")).toBe("png");
		expect(extensionOf("archive.tar.gz")).toBe("gz");
	});

	it("returns an empty string without a usable extension", () => {
		expect(extensionOf("README")).toBe("");
		expect(extensionOf("report.")).toBe("");
		expect(extensionOf("weird.verylongextension")).toBe("");
	});
});

describe("attachmentFormat", () => {
	it("maps an allowed extension to its mime and kind", () => {
		expect(attachmentFormat("photo.png")).toEqual({
			extension: "png",
			mime: "image/png",
			kind: "image",
		});
		expect(attachmentFormat("report.pdf")?.kind).toBe("pdf");
		expect(attachmentFormat("notes.md")?.kind).toBe("text");
		expect(attachmentFormat("config.json")?.kind).toBe("text");
		expect(attachmentFormat("compose.yml")?.kind).toBe("text");
		expect(attachmentFormat("Cargo.toml")?.kind).toBe("text");
		expect(attachmentFormat(".env")?.kind).toBe("text");
		expect(attachmentFormat("dump.zip")?.kind).toBe("file");
	});

	it("blocks active content and unknown types", () => {
		expect(attachmentFormat("logo.svg")).toBeNull();
		expect(attachmentFormat("page.html")).toBeNull();
		expect(attachmentFormat("script.js")).toBeNull();
		expect(attachmentFormat("tool.exe")).toBeNull();
		expect(attachmentFormat("build.bin")).toBeNull();
	});

	it("ignores the extensionless files and the declared mime type", () => {
		expect(attachmentFormat("screenshot")).toBeNull();
		expect(attachmentFormat("")).toBeNull();
	});
});

describe("attachmentKind", () => {
	it("names the preview class and blocks the rest", () => {
		expect(attachmentKind("photo.webp")).toBe("image");
		expect(attachmentKind("page.html")).toBe("blocked");
	});
});

describe("filterFiles", () => {
	it("keeps the allowed files and reports the rest", () => {
		const result = filterFiles([
			file("photo.png", "image/png"),
			file("page.html", "text/html"),
			file("notes.txt", "text/plain"),
		]);
		expect(result.accepted.map((item) => item.name)).toEqual([
			"photo.png",
			"notes.txt",
		]);
		expect(result.rejected.map((item) => item.name)).toEqual(["page.html"]);
	});
});

describe("rejectionMessage", () => {
	it("names the single rejected file", () => {
		expect(rejectionMessage([file("page.html")])).toBe(
			"page.html is not supported. Attach images, PDFs, text or archives.",
		);
	});

	it("counts several rejected files", () => {
		expect(rejectionMessage([file("page.html"), file("tool.exe")])).toBe(
			"None of the 2 files are supported. Attach images, PDFs, text or archives.",
		);
	});

	it("says nothing when nothing was rejected", () => {
		expect(rejectionMessage([])).toBe("");
	});
});

describe("ATTACHMENT_ACCEPT", () => {
	it("lists the allowed extensions", () => {
		const extensions = ATTACHMENT_ACCEPT.split(",");
		expect(extensions).toContain(".png");
		expect(extensions).toContain(".pdf");
		expect(extensions).not.toContain(".svg");
	});
});

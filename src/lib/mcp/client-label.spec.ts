import { CLIENT_INFO_META_KEY } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import { CLIENT_LABEL_MAX_LENGTH, clientLabel } from "./client-label.ts";

function envelope(info: unknown): Record<string, unknown> {
	return { [CLIENT_INFO_META_KEY]: info };
}

describe("clientLabel", () => {
	it("joins the name and the version", () => {
		expect(clientLabel(envelope({ name: "opencode", version: "1.2.3" }))).toBe(
			"opencode/1.2.3",
		);
	});

	it("keeps the name alone when the version is missing", () => {
		expect(clientLabel(envelope({ name: "cursor" }))).toBe("cursor");
	});

	it("returns null without client info", () => {
		expect(clientLabel(undefined)).toBeNull();
		expect(clientLabel(null)).toBeNull();
		expect(clientLabel({})).toBeNull();
		expect(clientLabel(envelope({ version: "1.0.0" }))).toBeNull();
	});

	it("strips control characters and squeezes spaces", () => {
		expect(clientLabel(envelope({ name: "a\n\tb", version: "1" }))).toBe(
			"a b/1",
		);
	});

	it("cuts the label at the maximum length", () => {
		const label = clientLabel(
			envelope({ name: "x".repeat(CLIENT_LABEL_MAX_LENGTH * 3) }),
		);
		expect(label).toHaveLength(CLIENT_LABEL_MAX_LENGTH);
	});
});

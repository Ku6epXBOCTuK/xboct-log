import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime } from "./display.ts";

const pad = (value: number) => String(value).padStart(2, "0");

describe("formatDate", () => {
	it("keeps a calendar day as written", () => {
		expect(formatDate("2026-11-05")).toBe("05/11/26");
	});
});

describe("formatDateTime", () => {
	it("renders a stored UTC timestamp in the local zone", () => {
		const iso = "2026-11-01T02:23:07.190Z";
		const date = new Date(iso);
		const expected = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${String(date.getFullYear()).slice(-2)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
		expect(formatDateTime(iso)).toBe(expected);
	});
});

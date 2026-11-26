import { describe, expect, it, vi } from "vitest";
import { getHealth } from "#lib/api/system/health.ts";

function answer(status: number, body: unknown): Response {
	return new Response(typeof body === "string" ? body : JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function stub(response: Response | Error) {
	return vi.fn(async () => {
		if (response instanceof Error) throw response;
		return response;
	}) as unknown as typeof globalThis.fetch;
}

const report = { ok: true, app: "xboct-log", version: "0.10.0" };

describe("getHealth", () => {
	it("accepts the report of the backend", async () => {
		const fetch = vi.fn(async () =>
			answer(200, report),
		) as unknown as typeof globalThis.fetch;

		await expect(getHealth(fetch)).resolves.toEqual(report);
		expect(fetch).toHaveBeenCalledWith(
			"/api/health",
			expect.objectContaining({
				cache: "no-store",
				headers: { accept: "application/json" },
			}),
		);
	});

	it("rejects another app that answers on the health path", async () => {
		await expect(
			getHealth(stub(answer(200, { ok: true, app: "other" }))),
		).rejects.toThrow("xboct-log");
	});

	it("rejects a report that does not say ok", async () => {
		await expect(
			getHealth(stub(answer(200, { ok: false, app: "xboct-log" }))),
		).rejects.toThrow();
	});

	it("rejects a page instead of a report", async () => {
		await expect(
			getHealth(stub(answer(200, "<!doctype html><html></html>"))),
		).rejects.toThrow();
	});

	it("rejects an error status", async () => {
		await expect(
			getHealth(stub(answer(503, { ok: false, app: "xboct-log" }))),
		).rejects.toThrow("503");
	});

	it("rejects when the request itself fails", async () => {
		await expect(
			getHealth(stub(new TypeError("fetch failed"))),
		).rejects.toThrow("fetch failed");
	});
});

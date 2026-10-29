import { afterEach, describe, expect, it, vi } from "vitest";
import { CLIENT_ID } from "./id.ts";
import { CLIENT_HEADER } from "#lib/types.ts";
import { createRemoteFetch, installRemoteFetch } from "./remote-fetch.ts";

const TIMEOUT_MS = 20;
const retryDelaysMs = [5];

function hanging(signal?: AbortSignal | null): Promise<Response> {
	return new Promise((_, reject) => {
		signal?.addEventListener("abort", () => reject(signal.reason), {
			once: true,
		});
	});
}

function ok(): Response {
	return new Response(JSON.stringify({ type: "result", result: null }), {
		status: 200,
	});
}

function options(fetch: typeof globalThis.fetch) {
	return { fetch, timeoutMs: TIMEOUT_MS, retryDelaysMs };
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("createRemoteFetch", () => {
	it("retries a hung query with a fresh timeout", async () => {
		const base = vi
			.fn<typeof fetch>()
			.mockImplementationOnce((_input, init) => hanging(init?.signal))
			.mockResolvedValueOnce(ok());
		const fetch = createRemoteFetch(options(base));

		const response = await fetch("/_app/remote/getTasks?payload=%7B%7D");

		expect(response.status).toBe(200);
		expect(base).toHaveBeenCalledTimes(2);
	});

	it("gives up on a query after the last retry", async () => {
		const base = vi
			.fn<typeof fetch>()
			.mockImplementation((_input, init) => hanging(init?.signal));
		const fetch = createRemoteFetch(options(base));

		await expect(fetch("/_app/remote/getTasks")).rejects.toMatchObject({
			name: "TimeoutError",
		});
		expect(base).toHaveBeenCalledTimes(2);
	});

	it("never retries a command", async () => {
		const base = vi
			.fn<typeof fetch>()
			.mockImplementation((_input, init) => hanging(init?.signal));
		const fetch = createRemoteFetch(options(base));

		await expect(
			fetch("/_app/remote/closeTask", { method: "POST", body: "{}" }),
		).rejects.toMatchObject({ name: "TimeoutError" });
		expect(base).toHaveBeenCalledTimes(1);
	});

	it("does not retry a command that fails at the network level", async () => {
		const base = vi
			.fn<typeof fetch>()
			.mockRejectedValue(new TypeError("fetch failed"));
		const fetch = createRemoteFetch(options(base));

		await expect(
			fetch("/_app/remote/closeTask", { method: "POST" }),
		).rejects.toThrow("fetch failed");
		expect(base).toHaveBeenCalledTimes(1);
	});

	it("retries a transient server error", async () => {
		const base = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(new Response(null, { status: 503 }))
			.mockResolvedValueOnce(ok());
		const fetch = createRemoteFetch(options(base));

		const response = await fetch("/_app/remote/getTasks");

		expect(response.status).toBe(200);
		expect(base).toHaveBeenCalledTimes(2);
	});

	it("does not retry a client error", async () => {
		const base = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response(null, { status: 404 }));
		const fetch = createRemoteFetch(options(base));

		const response = await fetch("/_app/remote/getTasks");

		expect(response.status).toBe(404);
		expect(base).toHaveBeenCalledTimes(1);
	});

	it("does not retry when the caller aborts", async () => {
		const controller = new AbortController();
		const base = vi.fn<typeof fetch>().mockImplementation((_input, init) => {
			setTimeout(() => controller.abort(), 0);
			return hanging(init?.signal);
		});
		const fetch = createRemoteFetch(options(base));

		await expect(
			fetch("/_app/remote/getTasks", { signal: controller.signal }),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(base).toHaveBeenCalledTimes(1);
	});

	it("marks remote requests with the client id", async () => {
		const base = vi.fn<typeof fetch>().mockResolvedValue(ok());
		const fetch = createRemoteFetch(options(base));

		await fetch("/_app/remote/getTags");

		const init = base.mock.calls[0]?.[1];
		expect(new Headers(init?.headers).get(CLIENT_HEADER)).toBe(CLIENT_ID);
	});

	it("leaves requests outside /remote/ untouched", async () => {
		const base = vi.fn<typeof fetch>().mockResolvedValue(ok());
		const fetch = createRemoteFetch(options(base));
		const controller = new AbortController();

		await fetch("/api/events", { signal: controller.signal });

		expect(base).toHaveBeenCalledWith("/api/events", {
			signal: controller.signal,
		});
	});

	it("installs itself over globalThis.fetch", async () => {
		const base = vi.fn<typeof fetch>().mockResolvedValue(ok());
		vi.stubGlobal("fetch", base);

		installRemoteFetch();
		await globalThis.fetch("/_app/remote/getTags");

		expect(base).toHaveBeenCalledTimes(1);
		expect(globalThis.fetch).not.toBe(base);
	});
});

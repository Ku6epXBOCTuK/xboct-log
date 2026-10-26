import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDebouncedValue } from "./debounce.svelte.ts";

describe("debounced value", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("applies the value only after the delay", () => {
		const search = createDebouncedValue("", 10);

		search.set("log");

		expect(search.value).toBe("log");
		expect(search.applied).toBe("");

		vi.advanceTimersByTime(10);

		expect(search.applied).toBe("log");
	});

	it("keeps only the last value typed inside the delay", () => {
		const search = createDebouncedValue("", 10);

		search.set("l");
		search.set("lo");
		search.set("log");
		vi.advanceTimersByTime(10);

		expect(search.applied).toBe("log");
	});

	it("applies immediately and drops the pending value", () => {
		const search = createDebouncedValue("log", 10);

		search.set("logging");
		search.apply("");

		expect(search.value).toBe("");
		expect(search.applied).toBe("");

		vi.advanceTimersByTime(50);

		expect(search.applied).toBe("");
	});

	it("cancels a pending update", () => {
		const search = createDebouncedValue("", 10);

		search.set("log");
		search.cancel();
		vi.advanceTimersByTime(50);

		expect(search.value).toBe("log");
		expect(search.applied).toBe("");
	});
});

import { describe, expect, it } from "vitest";
import { createDataLayer } from "./data.svelte.ts";

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe("data layer", () => {
	it("discards a read that resolves after a write to the same key", async () => {
		const data = createDataLayer();
		const cell = data.cell("plan:PL-1", "old");
		const source = deferred<string>();

		const loading = data.load(
			"plan:PL-1",
			() => source.promise,
			(value) => cell.set(value),
		);
		cell.set("written");
		source.resolve("stale");
		await loading;

		expect(cell.value).toBe("written");
	});

	it("discards the earlier of two concurrent reads for one key", async () => {
		const data = createDataLayer();
		const cell = data.cell("plans:list", "old");
		const first = deferred<string>();
		const second = deferred<string>();
		let calls = 0;
		const fetch = () => {
			calls++;
			return calls === 1 ? first.promise : second.promise;
		};

		const load = () =>
			data.load("plans:list", fetch, (value) => cell.set(value));
		const earlier = load();
		const later = data.load(
			"plans:list",
			fetch,
			(value) => cell.set(value),
			true,
		);
		second.resolve("new");
		await later;
		first.resolve("old");
		await earlier;

		expect(calls).toBe(2);
		expect(cell.value).toBe("new");
	});

	it("reuses one request for an unforced read of the same key", async () => {
		const data = createDataLayer();
		const cell = data.cell("stats", 0);
		const fetch = () => Promise.resolve(3);
		const apply = (value: number) => cell.set(value);

		await Promise.all([
			data.load("stats", fetch, apply),
			data.load("stats", fetch, apply),
		]);

		expect(cell.value).toBe(3);
	});

	it("keeps counts when an entity is written from a partial record", () => {
		const data = createDataLayer();
		const plans = data.entities<{
			id: string;
			name: string;
			counts: number;
		}>("plans", (current, next) => ({
			...next,
			counts: current.counts,
		}));

		plans.put({ id: "PL-1", name: "one", counts: 2 });
		plans.put({ id: "PL-1", name: "two", counts: 0 });

		expect(plans.get("PL-1")).toEqual({ id: "PL-1", name: "two", counts: 2 });
		expect(plans.all()).toHaveLength(1);
	});
});

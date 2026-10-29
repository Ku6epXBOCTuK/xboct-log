import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFreshness, type Freshness } from "./live.ts";

class FakeEventSource {
	static instances: FakeEventSource[] = [];

	url: string;
	closed = false;
	listeners = new Map<string, Set<(event: { data?: string }) => void>>();

	constructor(url: string) {
		this.url = url;
		FakeEventSource.instances.push(this);
	}

	addEventListener(type: string, listener: (event: { data?: string }) => void) {
		const set = this.listeners.get(type) ?? new Set();
		set.add(listener);
		this.listeners.set(type, set);
	}

	close() {
		this.closed = true;
	}

	emit(type: string, data?: unknown) {
		if (this.closed) {
			return;
		}
		for (const listener of this.listeners.get(type) ?? []) {
			listener({ data: data === undefined ? undefined : JSON.stringify(data) });
		}
	}
}

const visibility = { state: "visible" };
const domListeners = new Map<string, () => void>();

function triggerVisibility() {
	domListeners.get("visibilitychange")?.();
}

function deferred() {
	let resolve: () => void = () => {};
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

type Reloads = ReturnType<typeof reloads>;

function reloads() {
	return {
		tasks: vi.fn(async () => {}),
		projects: vi.fn(async () => {}),
		scopes: vi.fn(async () => {}),
		tags: vi.fn(async () => {}),
		comments: vi.fn(async () => {}),
		counters: vi.fn(async () => {}),
	};
}

function wire(fresh: Freshness, handlers: Reloads = reloads()) {
	for (const [target, handler] of Object.entries(handlers)) {
		fresh.register(target as keyof Reloads, handler);
	}
	return handlers;
}

function connected() {
	return FakeEventSource.instances.at(-1)!;
}

describe("createFreshness", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		FakeEventSource.instances = [];
		domListeners.clear();
		visibility.state = "visible";
		vi.stubGlobal("EventSource", FakeEventSource);
		vi.stubGlobal("document", {
			get visibilityState() {
				return visibility.state;
			},
			addEventListener: (type: string, listener: () => void) => {
				domListeners.set(type, listener);
			},
			removeEventListener: (type: string) => {
				domListeners.delete(type);
			},
		});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("reloads the registered handlers after the coalesce window", async () => {
		const fresh = createFreshness();
		const handlers = wire(fresh);

		fresh.invalidate(["tasks"]);
		await vi.advanceTimersByTimeAsync(299);
		expect(handlers.tasks).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		expect(handlers.tasks).toHaveBeenCalledTimes(1);
	});

	it("coalesces a burst into one reload", async () => {
		const fresh = createFreshness();
		const handlers = wire(fresh);

		for (let i = 0; i < 10; i++) {
			fresh.invalidate(["tasks"]);
			await vi.advanceTimersByTimeAsync(20);
		}
		await vi.advanceTimersByTimeAsync(300);

		expect(handlers.tasks).toHaveBeenCalledTimes(1);
	});

	it("expands the dependencies of a streamed entity", async () => {
		const fresh = createFreshness();
		const handlers = wire(fresh);
		fresh.start();

		connected().emit("change", { entity: "tasks" });
		await vi.advanceTimersByTimeAsync(300);

		expect(handlers.tasks).toHaveBeenCalledTimes(1);
		expect(handlers.projects).toHaveBeenCalledTimes(1);
		expect(handlers.scopes).toHaveBeenCalledTimes(1);
		expect(handlers.tags).toHaveBeenCalledTimes(1);
		expect(handlers.counters).toHaveBeenCalledTimes(1);
		expect(handlers.comments).not.toHaveBeenCalled();
	});

	it("does not expand a local invalidation", async () => {
		const fresh = createFreshness();
		const handlers = wire(fresh);

		fresh.invalidate(["projects", "counters"]);
		await vi.advanceTimersByTimeAsync(300);

		expect(handlers.projects).toHaveBeenCalledTimes(1);
		expect(handlers.counters).toHaveBeenCalledTimes(1);
		expect(handlers.tasks).not.toHaveBeenCalled();
		expect(handlers.scopes).not.toHaveBeenCalled();
	});

	it("visits each target once when the dependencies form a cycle", async () => {
		const fresh = createFreshness();
		const handlers = wire(fresh);
		fresh.start();

		connected().emit("change", { entity: "tags" });
		await vi.advanceTimersByTimeAsync(300);

		expect(handlers.tags).toHaveBeenCalledTimes(1);
		expect(handlers.tasks).toHaveBeenCalledTimes(1);
	});

	it("ignores unknown entities and malformed payloads", async () => {
		const fresh = createFreshness();
		const handlers = wire(fresh);
		fresh.start();

		for (const data of ["not json", {}, { entity: "backup" }, { entity: 7 }]) {
			connected().emit("change", data);
		}
		await vi.advanceTimersByTimeAsync(300);

		expect(handlers.tasks).not.toHaveBeenCalled();
		expect(handlers.projects).not.toHaveBeenCalled();
	});

	it("keeps reloading the other handlers when one of them fails", async () => {
		const fresh = createFreshness();
		const handlers = wire(fresh);
		handlers.tasks.mockRejectedValue(new Error("offline"));
		fresh.start();

		connected().emit("change", { entity: "tasks" });
		await vi.advanceTimersByTimeAsync(300);

		expect(handlers.projects).toHaveBeenCalledTimes(1);
		expect(handlers.counters).toHaveBeenCalledTimes(1);
	});

	it("does not drop an invalidation that arrives during a reload", async () => {
		const fresh = createFreshness();
		const handlers = wire(fresh);
		const slow = deferred();
		handlers.tasks.mockReturnValueOnce(slow.promise);

		fresh.invalidate(["tasks"]);
		await vi.advanceTimersByTimeAsync(300);
		expect(handlers.tasks).toHaveBeenCalledTimes(1);

		fresh.invalidate(["tasks"]);
		slow.resolve();
		await vi.advanceTimersByTimeAsync(300);

		expect(handlers.tasks).toHaveBeenCalledTimes(2);
	});

	it("reloads everything on sync and on becoming visible", async () => {
		const fresh = createFreshness();
		const handlers = wire(fresh);
		fresh.start();

		connected().emit("sync");
		await vi.advanceTimersByTimeAsync(300);

		expect(handlers.tasks).toHaveBeenCalledTimes(1);
		expect(handlers.projects).toHaveBeenCalledTimes(1);

		visibility.state = "hidden";
		triggerVisibility();
		await vi.advanceTimersByTimeAsync(300);
		expect(handlers.tasks).toHaveBeenCalledTimes(1);

		visibility.state = "visible";
		triggerVisibility();
		await vi.advanceTimersByTimeAsync(300);
		expect(handlers.tasks).toHaveBeenCalledTimes(2);
	});

	it("closes the stream and drops the pending work on stop", async () => {
		const fresh = createFreshness();
		const handlers = wire(fresh);
		const stop = fresh.start();

		fresh.invalidate(["tasks"]);
		stop();
		await vi.advanceTimersByTimeAsync(300);

		expect(connected().closed).toBe(true);
		expect(handlers.tasks).not.toHaveBeenCalled();
		expect(domListeners.has("visibilitychange")).toBe(false);
	});

	it("stops calling a handler after it is unregistered", async () => {
		const fresh = createFreshness();
		const handler = vi.fn(async () => {});

		const off = fresh.register("tasks", handler);
		off();
		fresh.invalidate(["tasks"]);
		await vi.advanceTimersByTimeAsync(300);

		expect(handler).not.toHaveBeenCalled();
	});
});

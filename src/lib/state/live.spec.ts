import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommentsStore } from "./comments.svelte.ts";
import type { ProjectDataStore } from "./project-data.svelte.ts";
import type { ProjectStore } from "./projects.svelte.ts";
import type { ScopeStore } from "./scopes.svelte.ts";
import type { StatsStore } from "./stats.svelte.ts";
import type { TagStore } from "./tags.svelte.ts";
import type { TaskStore } from "./tasks.svelte.ts";

vi.mock("#lib/remote/fresh.ts", () => ({
	fetchFresh: (value: unknown) => value,
}));

vi.mock("#lib/remote/projects.remote.ts", () => ({
	getProjects: vi.fn(async () => [{ id: "alpha" }]),
}));

vi.mock("#lib/remote/scopes.remote.ts", () => ({
	getScopedProjectIds: vi.fn(async () => ["alpha"]),
	getScopes: vi.fn(async () => [{ id: 1 }]),
}));

const { startLiveSync } = await import("./live.ts");

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

function stores() {
	return {
		tasks: { refresh: vi.fn(async () => {}) } as unknown as TaskStore,
		projects: { replaceAll: vi.fn() } as unknown as ProjectStore,
		scopes: { replaceAll: vi.fn() } as unknown as ScopeStore,
		tags: { refresh: vi.fn(async () => {}) } as unknown as TagStore,
		comments: { refresh: vi.fn(async () => {}) } as unknown as CommentsStore,
		stats: { refresh: vi.fn(async () => {}) } as unknown as StatsStore,
		data: { refresh: vi.fn(async () => {}) } as unknown as ProjectDataStore,
	};
}

function connected() {
	return FakeEventSource.instances.at(-1)!;
}

describe("startLiveSync", () => {
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

	it("opens one stream and closes it on stop", () => {
		const stop = startLiveSync(stores());

		expect(FakeEventSource.instances).toHaveLength(1);
		expect(connected().url).toBe("/api/events");

		stop();

		expect(connected().closed).toBe(true);
	});

	it("coalesces a burst into one reload", async () => {
		const s = stores();
		startLiveSync(s);

		for (let i = 0; i < 10; i++) {
			connected().emit("change", { entity: "tasks" });
		}

		await vi.advanceTimersByTimeAsync(299);
		expect(s.tasks.refresh).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		expect(s.tasks.refresh).toHaveBeenCalledTimes(1);
	});

	it("reloads the stores that depend on tasks", async () => {
		const s = stores();
		startLiveSync(s);

		connected().emit("change", { entity: "tasks" });
		await vi.advanceTimersByTimeAsync(300);

		expect(s.tasks.refresh).toHaveBeenCalledTimes(1);
		expect(s.stats.refresh).toHaveBeenCalledTimes(1);
		expect(s.tags.refresh).toHaveBeenCalledTimes(1);
		expect(s.comments.refresh).toHaveBeenCalledTimes(1);
		expect(s.data.refresh).toHaveBeenCalledTimes(1);
		expect(s.projects.replaceAll).toHaveBeenCalledTimes(1);
		expect(s.scopes.replaceAll).toHaveBeenCalledTimes(1);
	});

	it("reloads only projects or scopes for their own events", async () => {
		const s = stores();
		startLiveSync(s);

		connected().emit("change", { entity: "projects" });
		await vi.advanceTimersByTimeAsync(300);

		expect(s.projects.replaceAll).toHaveBeenCalledTimes(1);
		expect(s.scopes.replaceAll).not.toHaveBeenCalled();
		expect(s.tasks.refresh).not.toHaveBeenCalled();

		connected().emit("change", { entity: "scopes" });
		await vi.advanceTimersByTimeAsync(300);

		expect(s.scopes.replaceAll).toHaveBeenCalledTimes(1);
		expect(s.tasks.refresh).not.toHaveBeenCalled();
	});

	it("reloads tags and comments for their own events", async () => {
		const s = stores();
		startLiveSync(s);

		connected().emit("change", { entity: "tags" });
		await vi.advanceTimersByTimeAsync(300);

		expect(s.tags.refresh).toHaveBeenCalledTimes(1);
		expect(s.tasks.refresh).not.toHaveBeenCalled();
		expect(s.comments.refresh).not.toHaveBeenCalled();

		connected().emit("change", { entity: "comments" });
		await vi.advanceTimersByTimeAsync(300);

		expect(s.comments.refresh).toHaveBeenCalledTimes(1);
		expect(s.tasks.refresh).not.toHaveBeenCalled();
	});

	it("ignores unknown entities and malformed payloads", async () => {
		const s = stores();
		startLiveSync(s);

		for (const data of ["not json", {}, { entity: "backup" }, { entity: 7 }]) {
			connected().emit("change", data);
		}
		await vi.advanceTimersByTimeAsync(300);

		expect(s.tasks.refresh).not.toHaveBeenCalled();
		expect(s.projects.replaceAll).not.toHaveBeenCalled();
		expect(s.scopes.replaceAll).not.toHaveBeenCalled();
	});

	it("keeps reloading the other stores when one of them fails", async () => {
		const s = stores();
		vi.mocked(s.tasks.refresh).mockRejectedValue(new Error("offline"));
		startLiveSync(s);

		connected().emit("change", { entity: "tasks" });
		await vi.advanceTimersByTimeAsync(300);

		expect(s.tags.refresh).toHaveBeenCalledTimes(1);
		expect(s.stats.refresh).toHaveBeenCalledTimes(1);
		expect(s.projects.replaceAll).toHaveBeenCalledTimes(1);
	});

	it("does not drop an event that arrives during a reload", async () => {
		const s = stores();
		const slow = deferred();
		vi.mocked(s.tasks.refresh).mockReturnValueOnce(slow.promise);
		startLiveSync(s);

		connected().emit("change", { entity: "tasks" });
		await vi.advanceTimersByTimeAsync(300);
		expect(s.tasks.refresh).toHaveBeenCalledTimes(1);

		connected().emit("change", { entity: "tasks" });
		slow.resolve();
		await vi.advanceTimersByTimeAsync(300);

		expect(s.tasks.refresh).toHaveBeenCalledTimes(2);
	});

	it("reloads everything on sync and on becoming visible", async () => {
		const s = stores();
		startLiveSync(s);

		connected().emit("sync");
		await vi.advanceTimersByTimeAsync(300);

		expect(s.tasks.refresh).toHaveBeenCalledTimes(1);
		expect(s.projects.replaceAll).toHaveBeenCalledTimes(1);
		expect(s.scopes.replaceAll).toHaveBeenCalledTimes(1);

		visibility.state = "hidden";
		triggerVisibility();
		await vi.advanceTimersByTimeAsync(300);
		expect(s.tasks.refresh).toHaveBeenCalledTimes(1);

		visibility.state = "visible";
		triggerVisibility();
		await vi.advanceTimersByTimeAsync(300);
		expect(s.tasks.refresh).toHaveBeenCalledTimes(2);
	});

	it("stops reloading after stop", async () => {
		const s = stores();
		const stop = startLiveSync(s);

		connected().emit("change", { entity: "tasks" });
		stop();
		await vi.advanceTimersByTimeAsync(300);

		expect(s.tasks.refresh).not.toHaveBeenCalled();
		expect(domListeners.has("visibilitychange")).toBe(false);
	});
});

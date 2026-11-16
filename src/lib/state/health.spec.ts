import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	reportReachable,
	reportUnreachable,
} from "#lib/client/reachability.ts";
import { createHealth } from "./health.svelte.ts";

const dom = new Map<string, () => void>();
const win = new Map<string, () => void>();
const view = { state: "visible" };

function fire(listeners: Map<string, () => void>, type: string): void {
	listeners.get(type)?.();
}

beforeEach(() => {
	vi.useFakeTimers();
	view.state = "visible";
	dom.clear();
	win.clear();
	vi.stubGlobal("document", {
		get visibilityState() {
			return view.state;
		},
		addEventListener: (type: string, listener: () => void) => {
			dom.set(type, listener);
		},
		removeEventListener: (type: string) => {
			dom.delete(type);
		},
	});
	vi.stubGlobal("window", {
		addEventListener: (type: string, listener: () => void) => {
			win.set(type, listener);
		},
		removeEventListener: (type: string) => {
			win.delete(type);
		},
	});
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("health store", () => {
	it("moves from checking to online on the first answer", async () => {
		let resolve: () => void = () => {};
		const probe = vi.fn(
			() =>
				new Promise<void>((done) => {
					resolve = done;
				}),
		);
		const health = createHealth({ probe });

		const stop = health.start();

		expect(health.state).toBe("checking");
		expect(probe).toHaveBeenCalledTimes(1);

		resolve();
		await vi.advanceTimersByTimeAsync(0);

		expect(health.state).toBe("online");
		expect(health.lastOkAt).not.toBeNull();
		stop();
	});

	it("keeps the indicator online through one quiet failure", async () => {
		let up = true;
		const probe = vi.fn(async () => {
			if (!up) throw new Error("down");
		});
		const health = createHealth({ probe });

		const stop = health.start();
		await vi.advanceTimersByTimeAsync(0);
		expect(health.state).toBe("online");

		up = false;
		await vi.advanceTimersByTimeAsync(5_000);

		expect(health.state).toBe("online");

		await vi.advanceTimersByTimeAsync(2_000);

		expect(health.state).toBe("offline");
		expect(probe).toHaveBeenCalledTimes(3);
		stop();
	});

	it("declares offline at once when the check is forced", async () => {
		let up = true;
		const probe = vi.fn(async () => {
			if (!up) throw new Error("down");
		});
		const health = createHealth({ probe });

		const stop = health.start();
		await vi.advanceTimersByTimeAsync(0);
		expect(health.state).toBe("online");

		up = false;
		await health.check();

		expect(health.state).toBe("offline");
		stop();
	});

	it("refreshes once when the backend comes back", async () => {
		let up = false;
		const probe = vi.fn(async () => {
			if (!up) throw new Error("down");
		});
		const onRecover = vi.fn();
		const health = createHealth({ probe, onRecover });

		const stop = health.start();
		await vi.advanceTimersByTimeAsync(0);
		await health.check();
		expect(health.state).toBe("offline");

		up = true;
		await health.check();

		expect(health.state).toBe("online");
		expect(onRecover).toHaveBeenCalledTimes(1);

		await health.check();
		await vi.advanceTimersByTimeAsync(5_000);

		expect(onRecover).toHaveBeenCalledTimes(1);
		stop();
	});

	it("takes a failed request as a reason to check and a good answer as online", async () => {
		let up = true;
		const probe = vi.fn(async () => {
			if (!up) throw new Error("down");
		});
		const onRecover = vi.fn();
		const health = createHealth({ probe, onRecover });

		const stop = health.start();
		await vi.advanceTimersByTimeAsync(0);
		expect(health.state).toBe("online");

		up = false;
		reportUnreachable();
		await vi.advanceTimersByTimeAsync(0);

		expect(health.state).toBe("offline");

		const probes = probe.mock.calls.length;
		up = true;
		reportReachable();
		await vi.advanceTimersByTimeAsync(0);

		expect(health.state).toBe("online");
		expect(onRecover).toHaveBeenCalledTimes(1);
		expect(probe).toHaveBeenCalledTimes(probes);
		stop();
	});

	it("pauses while the page is hidden and checks when it returns", async () => {
		const probe = vi.fn(async () => {});
		const health = createHealth({ probe });

		const stop = health.start();
		await vi.advanceTimersByTimeAsync(0);
		const calls = probe.mock.calls.length;

		view.state = "hidden";
		fire(dom, "visibilitychange");
		await vi.advanceTimersByTimeAsync(60_000);

		expect(probe).toHaveBeenCalledTimes(calls);

		view.state = "visible";
		fire(dom, "visibilitychange");
		await vi.advanceTimersByTimeAsync(0);

		expect(probe).toHaveBeenCalledTimes(calls + 1);
		stop();
	});

	it("checks when the browser changes the network state", async () => {
		const probe = vi.fn(async () => {
			throw new Error("down");
		});
		const health = createHealth({ probe });

		const stop = health.start();
		await vi.advanceTimersByTimeAsync(0);
		const calls = probe.mock.calls.length;

		fire(win, "online");
		await vi.advanceTimersByTimeAsync(0);

		expect(probe).toHaveBeenCalledTimes(calls + 1);
		stop();
	});

	it("stops polling and listening", async () => {
		const probe = vi.fn(async () => {
			throw new Error("down");
		});
		const health = createHealth({ probe });

		const stop = health.start();
		await vi.advanceTimersByTimeAsync(0);
		stop();
		const calls = probe.mock.calls.length;

		await vi.advanceTimersByTimeAsync(60_000);
		reportUnreachable();
		await vi.advanceTimersByTimeAsync(0);

		expect(probe).toHaveBeenCalledTimes(calls);
		expect(dom.size).toBe(0);
		expect(win.size).toBe(0);
	});

	it("ignores an answer that arrives after stop", async () => {
		let resolve: () => void = () => {};
		const probe = vi.fn(
			() =>
				new Promise<void>((done) => {
					resolve = done;
				}),
		);
		const health = createHealth({ probe });

		const stop = health.start();
		stop();
		resolve();
		await vi.advanceTimersByTimeAsync(0);

		expect(health.state).toBe("checking");
		expect(health.lastOkAt).toBeNull();
	});
});

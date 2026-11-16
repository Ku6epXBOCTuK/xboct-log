import { getHealth } from "#lib/api/health.ts";
import { watchReachability } from "#lib/client/reachability.ts";

export type BackendState = "checking" | "online" | "offline";

const ONLINE_MS = 5_000;
const OFFLINE_MS = 2_000;
const SILENT_FAILURES = 2;
const MIN_GAP_MS = 1_000;

export interface HealthOptions {
	probe?: () => Promise<unknown>;
	onlineMs?: number;
	offlineMs?: number;
	onRecover?: () => void;
}

export function createHealth(options: HealthOptions = {}) {
	const probe = options.probe ?? (() => getHealth());
	const onlineMs = options.onlineMs ?? ONLINE_MS;
	const offlineMs = options.offlineMs ?? OFFLINE_MS;

	let state = $state<BackendState>("checking");
	let lastOkAt = $state<number | null>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let started = false;
	let pending: Promise<void> | null = null;
	let startedAt = 0;
	let failures = 0;
	let unwatch: (() => void) | undefined;

	function clear(): void {
		if (timer !== undefined) {
			clearTimeout(timer);
			timer = undefined;
		}
	}

	function schedule(ms: number): void {
		clear();
		if (!started) return;
		timer = setTimeout(() => {
			timer = undefined;
			void run(false);
		}, ms);
	}

	function succeed(): void {
		failures = 0;
		lastOkAt = Date.now();
		const recovered = state === "offline";
		state = "online";
		if (recovered) {
			options.onRecover?.();
		}
		schedule(onlineMs);
	}

	function fail(urgent: boolean): void {
		failures += 1;
		if (state !== "offline" && (urgent || failures >= SILENT_FAILURES)) {
			state = "offline";
		}
		schedule(offlineMs);
	}

	function run(urgent: boolean): Promise<void> {
		if (!started) return Promise.resolve();
		if (pending !== null) return pending;
		if (!urgent) {
			const wait = MIN_GAP_MS - (Date.now() - startedAt);
			if (wait > 0) {
				schedule(wait);
				return Promise.resolve();
			}
		}
		startedAt = Date.now();
		pending = probe()
			.then(
				() => {
					if (started) succeed();
				},
				() => {
					if (started) fail(urgent);
				},
			)
			.finally(() => {
				pending = null;
			});
		return pending;
	}

	function onVisibility(): void {
		if (document.visibilityState === "hidden") {
			clear();
			return;
		}
		void run(true);
	}

	function onWake(): void {
		void run(true);
	}

	function signal(reachable: boolean): void {
		if (!started) return;
		if (reachable) {
			if (state !== "online") succeed();
			return;
		}
		if (state === "offline") return;
		void run(true);
	}

	function stop(): void {
		if (!started) return;
		started = false;
		clear();
		if (unwatch !== undefined) {
			unwatch();
			unwatch = undefined;
		}
		document.removeEventListener("visibilitychange", onVisibility);
		window.removeEventListener("online", onWake);
		window.removeEventListener("offline", onWake);
	}

	function start(): () => void {
		if (started) return () => {};
		started = true;
		unwatch = watchReachability(signal);
		document.addEventListener("visibilitychange", onVisibility);
		window.addEventListener("online", onWake);
		window.addEventListener("offline", onWake);
		void run(true);
		return stop;
	}

	return {
		get state() {
			return state;
		},
		get lastOkAt() {
			return lastOkAt;
		},
		check() {
			return run(true);
		},
		start,
		stop,
	};
}

export type HealthStore = ReturnType<typeof createHealth>;

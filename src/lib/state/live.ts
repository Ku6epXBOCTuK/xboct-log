import { CLIENT_ID } from "#lib/client/id.ts";
import { reloadApp } from "#lib/reload.ts";
import { ENTITIES, type Entity } from "#lib/types.ts";

const COALESCE_MS = 300;

const COUNTERS = "counters" as const;

type Target = Entity | typeof COUNTERS;

const DEPENDENCIES: Record<Entity, readonly Target[]> = {
	tasks: ["projects", "scopes", "tags", COUNTERS],
	projects: ["tasks", COUNTERS],
	scopes: ["tasks"],
	tags: ["tasks"],
	comments: [],
};

type Reload = () => void | Promise<void>;

export interface Freshness {
	register(target: Target, reload: Reload): () => void;
	invalidate(targets: Iterable<Target>): void;
	start(): () => void;
}

export function createFreshness(): Freshness {
	const reloads = new Map<Target, Set<Reload>>();
	const pending = new Set<Target>();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let queue: Promise<void> = Promise.resolve();

	function expand(targets: Iterable<Target>): Set<Target> {
		const seen = new Set<Target>();
		const stack = [...targets];
		while (stack.length > 0) {
			const target = stack.pop()!;
			if (seen.has(target)) {
				continue;
			}
			seen.add(target);
			for (const dependency of DEPENDENCIES[target as Entity] ?? []) {
				stack.push(dependency);
			}
		}
		return seen;
	}

	function reload(target: Target): Promise<void> {
		const handlers = [...(reloads.get(target) ?? [])];
		return Promise.all(
			handlers.map(async (handler) => {
				try {
					await handler();
				} catch (error) {
					console.warn(`[live] ${target} reload failed`, error);
				}
			}),
		).then(() => {});
	}

	function flush(): void {
		if (pending.size === 0) {
			return;
		}
		const targets = [...pending];
		pending.clear();
		queue = queue.then(() => Promise.all(targets.map(reload))).then(() => {});
	}

	function invalidate(targets: Iterable<Target>): void {
		for (const target of targets) {
			pending.add(target);
		}
		if (timer !== undefined) {
			clearTimeout(timer);
		}
		timer = setTimeout(() => {
			timer = undefined;
			flush();
		}, COALESCE_MS);
	}

	function start(): () => void {
		const source = new EventSource("/api/events");

		source.addEventListener("change", (event) => {
			const raw = (event as MessageEvent<string>).data;
			let change: { entity?: unknown; client?: unknown };
			try {
				change = JSON.parse(raw) as typeof change;
			} catch {
				return;
			}
			if (
				typeof change.entity !== "string" ||
				!ENTITIES.includes(change.entity as Entity) ||
				change.client === CLIENT_ID
			) {
				return;
			}
			invalidate(expand([change.entity as Entity]));
		});
		source.addEventListener("sync", () => invalidate(expand(ENTITIES)));
		source.addEventListener("reset", () => reloadApp());

		function handleVisibility(): void {
			if (document.visibilityState === "visible") {
				invalidate(expand(ENTITIES));
			}
		}
		document.addEventListener("visibilitychange", handleVisibility);

		return () => {
			source.close();
			document.removeEventListener("visibilitychange", handleVisibility);
			if (timer !== undefined) {
				clearTimeout(timer);
				timer = undefined;
			}
			pending.clear();
		};
	}

	function register(target: Target, handler: Reload): () => void {
		const handlers = reloads.get(target) ?? new Set<Reload>();
		handlers.add(handler);
		reloads.set(target, handlers);
		return () => {
			handlers.delete(handler);
		};
	}

	return { register, invalidate, start };
}

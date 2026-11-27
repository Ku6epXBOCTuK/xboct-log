import { untrack } from "svelte";
import { SvelteMap, SvelteSet } from "svelte/reactivity";

export function dataKey(
	entity: string,
	...parts: Array<string | number | null | undefined>
): string {
	return [
		entity,
		...parts.filter((part) => part !== null && part !== undefined),
	].join(":");
}

export interface DataCell<T> {
	readonly value: T;
	set(value: T): void;
}

export interface EntityCollection<T extends { id: string }> {
	get(id: string): T | undefined;
	all(): T[];
	put(value: T): void;
	remove(id: string): void;
	clear(): void;
}

export interface DataLayer {
	cell<T>(key: string, initial: T): DataCell<T>;
	entities<T extends { id: string }>(
		name: string,
		merge?: (current: T, next: T) => T,
	): EntityCollection<T>;
	load<T>(
		key: string,
		fetch: () => Promise<T>,
		apply: (value: T) => void,
		force?: boolean,
	): Promise<void>;
	touch(prefix: string): void;
	reset(): void;
}

export function createDataLayer(): DataLayer {
	const versions = new SvelteMap<string, number>();
	const tokens = new SvelteMap<string, number>();
	const loads = new SvelteMap<string, Promise<void>>();
	const keys = new SvelteSet<string>();
	let committing = false;

	function bump(prefix: string): void {
		untrack(() => {
			if (committing) return;
			for (const key of keys) {
				if (key === prefix || key.startsWith(`${prefix}:`)) {
					versions.set(key, (versions.get(key) ?? 0) + 1);
					tokens.set(key, (tokens.get(key) ?? 0) + 1);
				}
			}
			for (const key of loads.keys()) {
				if (key === prefix || key.startsWith(`${prefix}:`)) {
					tokens.set(key, (tokens.get(key) ?? 0) + 1);
				}
			}
		});
	}

	function cell<T>(key: string, initial: T): DataCell<T> {
		untrack(() => keys.add(key));
		let value = $state(initial);
		return {
			get value() {
				return value;
			},
			set(next: T) {
				value = next;
				bump(key);
			},
		};
	}

	function entities<T extends { id: string }>(
		name: string,
		merge?: (current: T, next: T) => T,
	): EntityCollection<T> {
		untrack(() => keys.add(name));
		const records = new SvelteMap<string, T>();
		const values = $derived.by(() => [...records.values()] as T[]);
		return {
			get(id) {
				return records.get(`${name}:${id}`);
			},
			all() {
				return values;
			},
			put(value) {
				const key = `${name}:${value.id}`;
				untrack(() => keys.add(key));
				const current = records.get(key);
				records.set(
					key,
					current !== undefined && merge !== undefined
						? merge(current, value)
						: value,
				);
				bump(name);
			},
			remove(id) {
				records.delete(`${name}:${id}`);
				bump(name);
			},
			clear() {
				records.clear();
				bump(name);
			},
		};
	}

	async function load<T>(
		key: string,
		fetch: () => Promise<T>,
		apply: (value: T) => void,
		force = false,
	): Promise<void> {
		untrack(() => keys.add(key));
		const pending = untrack(() => (force ? undefined : loads.get(key)));
		if (pending !== undefined) return pending;
		const { token, started } = untrack(() => {
			const token = (tokens.get(key) ?? 0) + 1;
			tokens.set(key, token);
			return { token, started: versions.get(key) ?? 0 };
		});
		const request = fetch().then((value) => {
			if (
				untrack(
					() =>
						tokens.get(key) !== token || (versions.get(key) ?? 0) !== started,
				)
			)
				return;
			committing = true;
			try {
				apply(value);
			} finally {
				committing = false;
			}
		});
		untrack(() => loads.set(key, request));
		try {
			await request;
		} finally {
			untrack(() => {
				if (loads.get(key) === request) loads.delete(key);
			});
		}
	}

	function touch(prefix: string): void {
		bump(prefix);
	}

	function reset(): void {
		versions.clear();
		tokens.clear();
		loads.clear();
		keys.clear();
	}

	return { cell, entities, load, touch, reset };
}

export const data = createDataLayer();

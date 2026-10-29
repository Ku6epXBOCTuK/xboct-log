import type { ActivitySource, Entity } from "#lib/types.ts";

export interface ChangeEvent {
	seq: number;
	entity: Entity;
	op: string;
	source: ActivitySource;
	client: string | null;
}

type Listener = (event: ChangeEvent) => void;

let seq = 0;
const listeners = new Set<Listener>();
const resetListeners = new Set<() => void>();

export function subscribe(listener: Listener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function subscribeReset(listener: () => void): () => void {
	resetListeners.add(listener);
	return () => resetListeners.delete(listener);
}

export function publishReset(): void {
	for (const listener of resetListeners) {
		listener();
	}
}

export function currentSeq(): number {
	return seq;
}

export function publishChange(
	entity: Entity,
	op: string,
	source: ActivitySource = "ui",
	client: string | null = null,
): void {
	seq += 1;
	const event: ChangeEvent = { seq, entity, op, source, client };
	for (const listener of listeners) {
		listener(event);
	}
}

const ENTITY_BY_PREFIX: Record<string, Entity> = {
	tasks: "tasks",
	projects: "projects",
	scopes: "scopes",
	tags: "tags",
	attachments: "tasks",
};

export function entityOf(opName: string): Entity | null {
	if (opName.startsWith("tasks_comments_")) {
		return "comments";
	}
	return ENTITY_BY_PREFIX[opName.split("_")[0]] ?? null;
}

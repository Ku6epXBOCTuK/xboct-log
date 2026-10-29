import type { Entity } from "#lib/types.ts";

export interface ChangeEvent {
	seq: number;
	entity: Entity;
	op: string;
}

type Listener = (event: ChangeEvent) => void;

let seq = 0;
const listeners = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function currentSeq(): number {
	return seq;
}

export function publishChange(entity: Entity, op: string): void {
	seq += 1;
	const event: ChangeEvent = { seq, entity, op };
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

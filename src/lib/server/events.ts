export const ENTITIES = ["tasks", "projects", "scopes"] as const;

export type Entity = (typeof ENTITIES)[number];

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

export function entityOf(opName: string): Entity | null {
	const prefix = opName.split("_")[0];
	return (ENTITIES as readonly string[]).includes(prefix)
		? (prefix as Entity)
		: null;
}

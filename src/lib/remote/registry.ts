import type { ZodType } from "zod";
import type { ActivityEntry } from "../server/activity";

export type OpKind = "query" | "command";

export interface OpDefinition {
	name: string;
	description: string;
	kind: OpKind;
	input: ZodType;
	// NOTE: `never` as parameter type makes every concrete handler assignable
	// (contravariance), while call sites cast their parsed input with `as never`.
	handler: (input: never) => unknown;
	activity?: (
		input: never,
		result: never,
	) => ActivityEntry | ActivityEntry[] | null;
}

const ops = new Map<string, OpDefinition>();

export function registerOp(op: OpDefinition): void {
	if (ops.has(op.name)) {
		throw new Error(`duplicate operation: ${op.name}`);
	}
	ops.set(op.name, op);
}

export function getOps(): ReadonlyMap<string, OpDefinition> {
	return ops;
}

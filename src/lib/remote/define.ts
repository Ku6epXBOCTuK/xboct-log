import { command, query } from "$app/server";
import { entityOf, publishChange } from "#lib/server/events.ts";
import type { z, ZodType } from "zod";
import { Err, Ok, type Result } from "neverthrow";
import type { AppError } from "../server/errors";
import { registerOp, type OpDefinition, type OpKind } from "./registry";
import { unwrap } from "./result";

export interface OpSpec<TSchema extends ZodType = ZodType, TResult = unknown> {
	name: string;
	description: string;
	kind: OpKind;
	input: TSchema;
	handler: (
		input: z.infer<TSchema>,
	) =>
		| TResult
		| Result<TResult, AppError>
		| Promise<TResult | Result<TResult, AppError>>;
}

function isAppResult(value: unknown): value is Result<unknown, AppError> {
	return value instanceof Ok || value instanceof Err;
}

export async function runOp(
	op: OpDefinition,
	input: unknown,
): Promise<unknown> {
	const parsed = op.input.parse(input);
	const value = await op.handler(parsed as never);
	const result = isAppResult(value) ? unwrap(value) : value;
	if (op.kind === "command") {
		const entity = entityOf(op.name);
		if (entity) {
			publishChange(entity, op.name);
		}
	}
	return result;
}

export function defineQuery<TSchema extends ZodType, TResult>(
	op: OpSpec<TSchema, TResult>,
) {
	registerOp(op);
	return query(op.input, (input) => runOp(op, input) as Promise<TResult>);
}

export function defineCommand<TSchema extends ZodType, TResult>(
	op: OpSpec<TSchema, TResult>,
) {
	registerOp(op);
	return command(op.input, (input) => runOp(op, input) as Promise<TResult>);
}

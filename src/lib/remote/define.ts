import { command, query } from "$app/server";
import { Err, Ok, type Result } from "neverthrow";
import type { AppError } from "../server/errors";
import { registerOp, type OpDefinition } from "./registry";
import { unwrap } from "./result";

function isAppResult(value: unknown): value is Result<unknown, AppError> {
	return value instanceof Ok || value instanceof Err;
}

export async function runOp(
	op: OpDefinition,
	input: unknown,
): Promise<unknown> {
	const parsed = op.input.parse(input);
	const value = await op.handler(parsed as never);
	return isAppResult(value) ? unwrap(value) : value;
}

export function defineQuery(op: OpDefinition) {
	registerOp(op);
	return query(op.input, (input) => runOp(op, input));
}

export function defineCommand(op: OpDefinition) {
	registerOp(op);
	return command(op.input, (input) => runOp(op, input));
}

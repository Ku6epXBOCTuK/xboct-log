import { command, query } from "$app/server";
import { entityOf, publishChange } from "#lib/server/events.ts";
import { type z, type ZodType } from "zod";
import { Err, Ok, type Result } from "neverthrow";
import type { AppError } from "../server/errors";
import { getDb } from "../server/db";
import { maybeAutoBackup } from "../server/auto-backup";
import { backupConfig } from "../server/backup";
import {
	recordActivity,
	type ActivityEntry,
	type ActivitySource,
} from "../server/activity";
import { registerOp, type OpDefinition, type OpKind } from "./registry";
import { unwrap } from "./result";

export interface OpSpec<TSchema extends ZodType = ZodType, TResult = unknown> {
	name: string;
	description: string;
	kind: OpKind;
	input: TSchema;
	output?: ZodType;
	handler: (
		input: z.infer<TSchema>,
	) =>
		| TResult
		| Result<TResult, AppError>
		| Promise<TResult | Result<TResult, AppError>>;
	activity?: (
		input: z.infer<TSchema>,
		result: never,
	) => ActivityEntry | ActivityEntry[] | null;
}

function isAppResult(value: unknown): value is Result<unknown, AppError> {
	return value instanceof Ok || value instanceof Err;
}

export async function runOp(
	op: OpDefinition,
	input: unknown,
	source: ActivitySource = "ui",
	client: string | null = null,
): Promise<unknown> {
	const parsed = op.input.parse(input);
	if (source === "mcp" && op.kind === "command") {
		await maybeAutoBackup(getDb(), backupConfig());
	}
	const value = await op.handler(parsed as never);
	const result = isAppResult(value) ? unwrap(value) : value;
	if (op.kind === "command") {
		const entity = entityOf(op.name);
		if (entity) {
			publishChange(entity, op.name);
		}
		const entries = op.activity?.(parsed as never, result as never);
		if (entries) {
			recordActivity(
				getDb(),
				source,
				op.name,
				Array.isArray(entries) ? entries : [entries],
				{ client },
			);
		}
	}
	return result;
}

export function defineQuery<TSchema extends ZodType, TResult>(
	op: OpSpec<TSchema, TResult>,
) {
	registerOp(op);
	return query(op.input, (input) => runOp(op, input, "ui") as Promise<TResult>);
}

export function defineCommand<TSchema extends ZodType, TResult>(
	op: OpSpec<TSchema, TResult>,
) {
	registerOp(op);
	return command(
		op.input,
		(input) => runOp(op, input, "ui") as Promise<TResult>,
	);
}

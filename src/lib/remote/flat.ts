import { z } from "zod";
import { strictObject } from "./strict";

type ObjectSchema = z.ZodObject<z.ZodRawShape>;

const PATCH = "patch";

export interface FlatPatch {
	input: ObjectSchema;
	normalize: (args: unknown) => unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function patchSchema(element: ObjectSchema): ObjectSchema {
	const raw = element.shape[PATCH];
	const patch = raw instanceof z.ZodOptional ? raw.unwrap() : raw;
	if (!(patch instanceof z.ZodObject)) {
		throw new Error("flat patch: patch is not an object");
	}
	return patch;
}

function flatten(element: ObjectSchema, patch: ObjectSchema): ObjectSchema {
	const rest = Object.entries(element.shape).filter(([name]) => name !== PATCH);
	const fields = Object.entries(patch.shape).map(([name, field]) => [
		name,
		(field as z.ZodType).optional(),
	]);
	return strictObject({
		...Object.fromEntries(rest),
		...Object.fromEntries(fields),
		[PATCH]: patch.optional(),
	});
}

function merge(value: unknown, patch: ObjectSchema): unknown {
	if (!isRecord(value)) {
		return value;
	}
	const names = Object.keys(patch.shape);
	const flat: Record<string, unknown> = {};
	const rest: Record<string, unknown> = {};
	for (const [key, field] of Object.entries(value)) {
		if (key === PATCH) {
			continue;
		}
		if (names.includes(key)) {
			flat[key] = field;
		} else {
			rest[key] = field;
		}
	}
	const nested = value[PATCH];
	return {
		...rest,
		[PATCH]: { ...flat, ...(isRecord(nested) ? nested : {}) },
	};
}

// NOTE: models routinely drop a required nested object, so the MCP schema puts
// the patch fields next to the id and keeps the nested object as an alias.
export function flatPatch(input: ObjectSchema): FlatPatch {
	const patch = patchSchema(input);
	return {
		input: flatten(input, patch),
		normalize: (args) => merge(args, patch),
	};
}

export function flatPatchItems(
	input: ObjectSchema,
	list: string,
	limits: { min?: number; max?: number } = {},
): FlatPatch {
	const array = input.shape[list];
	if (!(array instanceof z.ZodArray)) {
		throw new Error(`flat patch: ${list} is not an array`);
	}
	const element = array.element as ObjectSchema;
	const patch = patchSchema(element);
	let items = z.array(flatten(element, patch));
	if (limits.min !== undefined) {
		items = items.min(limits.min);
	}
	if (limits.max !== undefined) {
		items = items.max(limits.max);
	}
	return {
		input: strictObject({ [list]: items }),
		normalize: (args) => {
			if (!isRecord(args) || !Array.isArray(args[list])) {
				return args;
			}
			return {
				...args,
				[list]: args[list].map((item) => merge(item, patch)),
			};
		},
	};
}

import { z } from "zod";

// NOTE: MCP clients send array args as JSON strings when the advertised
// schema is anyOf [string, array]; declaring preprocess lists a clean
// {type: "array"} schema and still accepts the string forms.
function toList(val: unknown): unknown {
	if (val === undefined || val === null || Array.isArray(val)) {
		return val;
	}
	if (typeof val !== "string") {
		return [val];
	}
	const trimmed = val.trim();
	if (trimmed.startsWith("[")) {
		try {
			return JSON.parse(trimmed);
		} catch {
			return [trimmed];
		}
	}
	return trimmed
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
}

export function oneOrList<T extends z.ZodType>(inner: T) {
	return z.preprocess(toList, inner).optional();
}

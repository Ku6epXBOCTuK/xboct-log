import { z } from "zod";

export function strictObject<T extends z.ZodRawShape>(shape: T) {
	const allowed = Object.keys(shape);
	return z.strictObject(shape, {
		error: (issue) => {
			if (issue.code !== "unrecognized_keys") {
				return undefined;
			}
			return `Unknown parameter(s): ${issue.keys.join(", ")}. Allowed parameters: ${allowed.join(", ")}`;
		},
	});
}

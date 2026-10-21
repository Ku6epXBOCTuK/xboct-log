import { z } from "zod";

export const ID_DESCRIPTION =
	"Task id in the full 'PREFIX-NUMBER' form (e.g. 'LOG-82'); the prefix is matched case-insensitively, so 'log-82' works too. A bare task number (e.g. '82') is rejected: numbers are unique only inside a project, so resolve the project prefix first and pass 'LOG-82'. When nothing matches, the error suggests close ids.";

const BARE_NUMBER_PATTERN = /^\d+$/;

export function taskIdSchema(description: string) {
	return z
		.string()
		.min(1)
		.refine((value) => !BARE_NUMBER_PATTERN.test(value.trim()), {
			message:
				"Use the full 'PREFIX-NUMBER' id (e.g. 'LOG-82'): a bare number is unique only inside a project.",
		})
		.describe(description);
}

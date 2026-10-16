import { error } from "@sveltejs/kit";
import type { Result } from "neverthrow";
import type { BacklogError } from "../server/errors";

export function unwrap<T>(result: Result<T, BacklogError>): T {
	if (result.isErr()) {
		error(result.error.status, result.error.message);
	}
	return result.value;
}

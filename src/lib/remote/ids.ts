import { error } from "@sveltejs/kit";
import { getDb } from "../server/db";
import { resolveTaskId } from "../server/tasks";

export function resolveTaskOrThrow(
	db: ReturnType<typeof getDb>,
	id: string,
): string {
	const resolved = resolveTaskId(db, id);
	if (resolved.isErr()) {
		error(resolved.error.status, resolved.error.message);
	}
	return resolved.value;
}

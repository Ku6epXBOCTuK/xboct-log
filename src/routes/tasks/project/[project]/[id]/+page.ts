import { error } from "@sveltejs/kit";
import { requireProject } from "#lib/navigation/load.ts";
import { isTaskId } from "#lib/tasks/route.ts";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ params, parent }) => {
	await requireProject(parent, params.project);
	if (!isTaskId(params.id)) error(404, "Task not found");
};

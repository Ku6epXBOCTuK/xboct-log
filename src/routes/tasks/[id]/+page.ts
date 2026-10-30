import { error } from "@sveltejs/kit";
import { isTaskId } from "#lib/tasks/route.ts";
import type { PageLoad } from "./$types";

export const load: PageLoad = ({ params }) => {
	if (!isTaskId(params.id)) error(404, "Task not found");
};

import { getProjects } from "#lib/remote/projects.remote.ts";
import { getScopedProjectIds, getScopes } from "#lib/remote/scopes.remote.ts";
import { getTags } from "#lib/remote/tags.remote.ts";
import { TASK_SNAPSHOT_LIMIT } from "#lib/tasks/snapshot.ts";
import { getTasks } from "#lib/remote/tasks.remote.ts";
import type { LayoutLoad } from "./$types";

export const load: LayoutLoad = async () => {
	const projects = await getProjects({ includeArchived: true });
	const tasks = await getTasks({
		limit: TASK_SNAPSHOT_LIMIT,
		include_description: true,
	});
	const tags = await getTags({});
	const scopedProjectIds = await getScopedProjectIds({});
	const scopes = (
		await Promise.all(
			scopedProjectIds.map((id) => getScopes({ project_id: id })),
		)
	).flat();

	return {
		projects,
		tasks: tasks.items,
		tasksTotal: tasks.total,
		tags: tags.items,
		scopes,
	};
};

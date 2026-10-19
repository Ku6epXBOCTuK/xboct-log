import { getProjects } from "#lib/remote/projects.remote.ts";
import { getScopedProjectIds, getScopes } from "#lib/remote/scopes.remote.ts";
import { getTasks } from "#lib/remote/tasks.remote.ts";
import type { LayoutLoad } from "./$types";

export const load: LayoutLoad = async () => {
	const projects = await getProjects({ includeArchived: true });
	const tasks = await getTasks({ limit: 1000 });
	const scopedProjectIds = await getScopedProjectIds({});
	const scopes = (
		await Promise.all(
			scopedProjectIds.map((id) => getScopes({ project_id: id })),
		)
	).flat();

	return { projects, tasks, scopes };
};

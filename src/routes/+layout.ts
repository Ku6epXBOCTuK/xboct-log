import {
	getProjects,
	getScopedProjectIds,
	getScopes,
} from "#lib/api/projects.ts";
import { getTagDictionary, getTags } from "#lib/api/tags.ts";
import type { LayoutLoad } from "./$types";

export const ssr = false;

export const load: LayoutLoad = async ({ depends }) => {
	depends("app:projects");
	const projects = await getProjects({ includeArchived: true });
	const tags = await getTags({});
	const tagNames = await getTagDictionary({});
	const scopedProjectIds = await getScopedProjectIds({});
	const scopes = (
		await Promise.all(
			scopedProjectIds.map((id) => getScopes({ project_id: id })),
		)
	).flat();

	return {
		projects,
		tags: tags.items,
		tagNames: tagNames.items,
		scopes,
	};
};

import { requireProject } from "#lib/navigation/load.ts";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ params, parent }) => {
	await requireProject(parent, params.project);
};

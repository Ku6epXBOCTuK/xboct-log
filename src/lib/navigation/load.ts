import { error } from "@sveltejs/kit";
import type { Project } from "#lib/types.ts";

export async function requireProject(
	parent: () => Promise<{ projects: Project[] }>,
	projectId: string,
): Promise<void> {
	const { projects } = await parent();
	if (!projects.some((project) => project.id === projectId)) {
		error(404, "Project not found");
	}
}

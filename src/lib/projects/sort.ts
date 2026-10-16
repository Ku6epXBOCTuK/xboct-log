import { INBOX_PROJECT_ID, type Project } from "#lib/types.ts";

export function sortProjects(projects: Project[]): Project[] {
	return [...projects].sort((left, right) => {
		if (left.id === INBOX_PROJECT_ID) return -1;
		if (right.id === INBOX_PROJECT_ID) return 1;
		return left.name.localeCompare(right.name);
	});
}

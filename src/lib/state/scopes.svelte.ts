import {
	createScope as createScopeRemote,
	deleteScope as deleteScopeRemote,
	updateScope as updateScopeRemote,
} from "#lib/remote/scopes.remote.ts";
import type { ProjectFilter, Scope } from "#lib/types.ts";

export interface NewScopeInput {
	project_id: string;
	name: string;
}

function sortScopes(scopes: Scope[]): Scope[] {
	return [...scopes].sort(
		(left, right) =>
			left.project_id.localeCompare(right.project_id) ||
			left.name.localeCompare(right.name),
	);
}

export function createScopeStore(initial: Scope[]) {
	let scopes = $state(sortScopes(initial));

	const byProject = $derived.by(() => {
		const map: Record<string, Scope[]> = {};
		for (const scope of scopes) {
			(map[scope.project_id] ??= []).push(scope);
		}
		return map;
	});

	function replace(updated: Scope) {
		scopes = sortScopes(
			scopes.map((scope) => (scope.id === updated.id ? updated : scope)),
		);
	}

	return {
		get all() {
			return scopes;
		},
		get byProject() {
			return byProject;
		},
		listFor(projectId: ProjectFilter) {
			return projectId === null ? scopes : (byProject[projectId] ?? []);
		},
		hasProject(projectId: string) {
			return (byProject[projectId]?.length ?? 0) > 0;
		},
		async create(input: NewScopeInput) {
			const scope = await createScopeRemote(input);
			scopes = sortScopes([...scopes, scope]);
			return scope;
		},
		async rename(id: number, name: string) {
			const updated = await updateScopeRemote({ id, patch: { name } });
			replace(updated);
			return updated;
		},
		async destroy(id: number) {
			await deleteScopeRemote(id);
			scopes = scopes.filter((scope) => scope.id !== id);
		},
	};
}

export type ScopeStore = ReturnType<typeof createScopeStore>;

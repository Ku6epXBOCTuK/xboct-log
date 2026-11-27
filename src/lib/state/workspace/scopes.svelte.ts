import {
	createScope as createScopeRemote,
	deleteScope as deleteScopeRemote,
	updateScope as updateScopeRemote,
} from "#lib/api/workspace/projects.ts";
import { data } from "#lib/data/data.svelte.ts";
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
	const scopes = data.cell<Scope[]>("scopes:all", sortScopes(initial));

	const byProject = $derived.by(() => {
		const map: Record<string, Scope[]> = {};
		for (const scope of scopes.value) {
			(map[scope.project_id] ??= []).push(scope);
		}
		return map;
	});

	function replace(updated: Scope) {
		scopes.set(
			sortScopes(
				scopes.value.map((scope) =>
					scope.id === updated.id ? updated : scope,
				),
			),
		);
	}

	return {
		get all() {
			return scopes.value;
		},
		get byProject() {
			return byProject;
		},
		replaceAll(next: Scope[]) {
			scopes.set(sortScopes(next));
		},
		replaceProject(projectId: string, next: Scope[]) {
			scopes.set(
				sortScopes([
					...scopes.value.filter((scope) => scope.project_id !== projectId),
					...next,
				]),
			);
		},
		listFor(projectId: ProjectFilter) {
			return projectId === null ? scopes.value : (byProject[projectId] ?? []);
		},
		hasProject(projectId: string) {
			return (byProject[projectId]?.length ?? 0) > 0;
		},
		async create(input: NewScopeInput) {
			const scope = await createScopeRemote(input);
			scopes.set(sortScopes([...scopes.value, scope]));
			return scope;
		},
		async rename(id: number, name: string) {
			const updated = await updateScopeRemote({
				scope_id: id,
				patch: { name },
			});
			replace(updated);
			return updated;
		},
		async destroy(id: number) {
			await deleteScopeRemote({ scope_id: id });
			scopes.set(scopes.value.filter((scope) => scope.id !== id));
		},
	};
}

export type ScopeStore = ReturnType<typeof createScopeStore>;

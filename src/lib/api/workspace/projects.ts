import type { ScopeDeleteReport } from "#lib/api/types.ts";
import type { Project, Scope, Status } from "#lib/types.ts";
import { client, unwrap } from "#lib/api/system/client.ts";

type Counts = Record<Status, number>;

export type ProjectWithCounts = Project & {
	task_counts: Counts;
	epic_counts: Counts;
};

export async function getProjects(
	input: { includeArchived?: boolean; q?: string; repo?: string } = {},
): Promise<ProjectWithCounts[]> {
	const answer = await client.POST("/api/projects_list", { body: input });
	return unwrap<{ items: ProjectWithCounts[] }>(answer).items;
}

export type ProjectRef = ProjectWithCounts & {
	scope_counts: {
		scope_id: number;
		name: string;
		tasks: number;
		epics: number;
	}[];
};

export async function getProject(input: {
	project_id: string;
}): Promise<ProjectRef> {
	return unwrap<ProjectRef>(
		await client.POST("/api/projects_get", { body: input }),
	);
}

export async function createProject(input: {
	project_id: string;
	name: string;
	prefix: string;
	repo?: string | null;
}): Promise<Project> {
	return unwrap<Project>(
		await client.POST("/api/projects_create", { body: input }),
	);
}

export async function updateProject(input: {
	project_id: string;
	patch: { name?: string; archived?: boolean; repo?: string | null };
}): Promise<Project> {
	return unwrap<Project>(
		await client.POST("/api/projects_update", { body: input }),
	);
}

export type ScopeWithCounts = Scope & {
	task_count: number;
	tasks_total: number;
	epics_count: number;
};

export async function getScopes(
	input: { project_id?: string } = {},
): Promise<ScopeWithCounts[]> {
	const answer = await client.POST("/api/scopes_list", { body: input });
	return unwrap<{ items: ScopeWithCounts[] }>(answer).items;
}

export async function getScope(input: {
	scope_id: number;
}): Promise<ScopeWithCounts> {
	return unwrap<ScopeWithCounts>(
		await client.POST("/api/scopes_get", { body: input }),
	);
}

export async function getScopedProjectIds(
	input: Record<string, never> = {},
): Promise<string[]> {
	const answer = await client.POST("/api/scopes_project_ids", { body: input });
	return unwrap<{ items: string[] }>(answer).items;
}

export async function createScope(input: {
	project_id: string;
	name: string;
}): Promise<Scope> {
	return unwrap<Scope>(
		await client.POST("/api/scopes_create", { body: input }),
	);
}

export async function updateScope(input: {
	scope_id: number;
	patch: { name: string };
}): Promise<Scope> {
	return unwrap<Scope>(
		await client.POST("/api/scopes_update", { body: input }),
	);
}

export async function deleteScope(input: {
	scope_id: number;
	dry_run?: boolean;
}): Promise<ScopeDeleteReport> {
	return unwrap<ScopeDeleteReport>(
		await client.POST("/api/scopes_delete", { body: input }),
	);
}

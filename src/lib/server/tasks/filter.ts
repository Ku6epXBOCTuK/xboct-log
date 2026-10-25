import { normalizeTaskIdInput } from "./resolve";
import type { TaskQuery } from "./types";

export interface TaskFilterSql {
	where: string[];
	params: (string | number)[];
	joins: string;
}

export function blockingIdMatch(value: string): {
	sql: string;
	params: (string | number)[];
} {
	const trimmed = normalizeTaskIdInput(value.trim());
	return {
		sql: "(SELECT id FROM tasks WHERE id = ? AND deleted_at IS NULL)",
		params: [trimmed],
	};
}

function toStringList(value: string | string[]): string[] {
	return Array.isArray(value) ? value : [value];
}

function toNumberList(value: number | number[]): number[] {
	return Array.isArray(value) ? value : [value];
}

export function buildTaskFilter(query: TaskQuery): TaskFilterSql {
	const where: string[] = [];
	const params: (string | number)[] = [];
	let joins = "";

	if (query.deleted_only) {
		where.push("tasks.deleted_at IS NOT NULL");
	} else if (!query.include_deleted) {
		where.push("tasks.deleted_at IS NULL");
	}

	const projectIds = query.project_id
		? toStringList(query.project_id)
		: undefined;
	if (projectIds?.length) {
		where.push(`tasks.project_id IN (${projectIds.map(() => "?").join(", ")})`);
		params.push(...projectIds);
	}
	const excludedProjectIds = query.exclude_project_id
		? toStringList(query.exclude_project_id)
		: undefined;
	if (excludedProjectIds?.length) {
		where.push(
			`tasks.project_id NOT IN (${excludedProjectIds.map(() => "?").join(", ")})`,
		);
		params.push(...excludedProjectIds);
	}
	if (query.status?.length) {
		where.push(`tasks.status IN (${query.status.map(() => "?").join(", ")})`);
		params.push(...query.status);
	}
	if (query.priority?.length) {
		where.push(
			`tasks.priority IN (${query.priority.map(() => "?").join(", ")})`,
		);
		params.push(...query.priority);
	}
	if (query.estimate?.length) {
		where.push(
			`tasks.estimate IN (${query.estimate.map(() => "?").join(", ")})`,
		);
		params.push(...query.estimate);
	}
	if (query.assignee?.length) {
		where.push(
			`ULOWER(tasks.assignee) IN (${query.assignee.map(() => "?").join(", ")})`,
		);
		params.push(...query.assignee.map((assignee) => assignee.toLowerCase()));
	}
	if (query.due_before !== undefined) {
		where.push("tasks.due_at IS NOT NULL AND tasks.due_at < ?");
		params.push(query.due_before);
	}
	if (query.due_after !== undefined) {
		where.push("tasks.due_at IS NOT NULL AND tasks.due_at >= ?");
		params.push(query.due_after);
	}
	if (query.is_epic !== undefined) {
		where.push("tasks.is_epic = ?");
		params.push(query.is_epic ? 1 : 0);
	}
	if (query.epic_id !== undefined) {
		if (query.epic_id === null) {
			where.push("tasks.epic_id IS NULL");
		} else {
			const epicRefs = toStringList(query.epic_id);
			const clauses: string[] = [];
			for (const ref of epicRefs) {
				const trimmed = normalizeTaskIdInput(ref.trim());
				clauses.push("tasks.epic_id = ?");
				params.push(trimmed);
			}
			if (clauses.length) {
				where.push(`(${clauses.join(" OR ")})`);
			}
		}
	}
	if (query.scope_id !== undefined) {
		if (query.scope_id === null) {
			where.push("tasks.scope_id IS NULL");
		} else {
			const scopeIds = toNumberList(query.scope_id);
			if (scopeIds.length) {
				where.push(`tasks.scope_id IN (${scopeIds.map(() => "?").join(", ")})`);
				params.push(...scopeIds);
			}
		}
	}
	if (query.has_epic !== undefined) {
		where.push(
			query.has_epic ? "tasks.epic_id IS NOT NULL" : "tasks.epic_id IS NULL",
		);
	}
	if (query.has_scope !== undefined) {
		where.push(
			query.has_scope ? "tasks.scope_id IS NOT NULL" : "tasks.scope_id IS NULL",
		);
	}
	if (query.has_tags !== undefined) {
		where.push(
			query.has_tags
				? "json_array_length(tasks.tags) > 0"
				: "json_array_length(tasks.tags) = 0",
		);
	}
	if (query.blocked_by !== undefined) {
		const match = blockingIdMatch(query.blocked_by);
		where.push(
			`tasks.id IN (SELECT target_task_id FROM task_links WHERE link_type = 'blocks' AND source_task_id IN ${match.sql})`,
		);
		params.push(...match.params);
	}
	if (query.blocks !== undefined) {
		const match = blockingIdMatch(query.blocks);
		where.push(
			`tasks.id IN (SELECT source_task_id FROM task_links WHERE link_type = 'blocks' AND target_task_id IN ${match.sql})`,
		);
		params.push(...match.params);
	}
	if (query.tag?.length) {
		where.push(
			`EXISTS (SELECT 1 FROM json_each(tasks.tags) WHERE ULOWER(json_each.value) IN (${query.tag
				.map(() => "?")
				.join(", ")}))`,
		);
		params.push(...query.tag.map((tag) => tag.toLowerCase()));
	}
	if (query.q) {
		const like = `%${query.q.toLowerCase()}%`;
		where.push(
			`(ULOWER(tasks.title) LIKE ? OR ULOWER(tasks.description) LIKE ? OR ULOWER(tasks.id) LIKE ?
			  OR ULOWER(tasks.epic_id) LIKE ?
			  OR EXISTS (SELECT 1 FROM json_each(tasks.tags) WHERE ULOWER(json_each.value) LIKE ?))`,
		);
		params.push(like, like, like, like, like);
	}
	if (query.title) {
		const like = `%${query.title.toLowerCase()}%`;
		where.push("ULOWER(tasks.title) LIKE ?");
		params.push(like);
	}
	if (query.title_exact) {
		where.push("ULOWER(tasks.title) = ULOWER(?)");
		params.push(query.title_exact);
	}
	if (query.source_file) {
		const like = `%${query.source_file.toLowerCase()}%`;
		where.push("ULOWER(tasks.source_file) LIKE ?");
		params.push(like);
	}
	if (query.include_project === true || query.project_archived !== undefined) {
		joins += " LEFT JOIN projects ON tasks.project_id = projects.id";
	}
	if (query.include_scope === true) {
		joins += " LEFT JOIN scopes ON tasks.scope_id = scopes.id";
	}
	if (query.project_archived === true) {
		where.push("projects.archived_at IS NOT NULL");
	} else if (query.project_archived === false) {
		where.push("projects.archived_at IS NULL");
	}

	return { where, params, joins };
}

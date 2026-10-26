import type { DatabaseSync } from "node:sqlite";
import { ACTIVE_STATUSES, type Status } from "../../types";

export interface TagCount {
	tag: string;
	count: number;
	active: number;
}

export interface TagQuery {
	project_id?: string | string[];
	status?: Status[];
}

export function listTags(db: DatabaseSync, query: TagQuery = {}): TagCount[] {
	const where = ["tasks.deleted_at IS NULL"];
	const params: (string | number)[] = [];

	const projectIds = query.project_id
		? Array.isArray(query.project_id)
			? query.project_id
			: [query.project_id]
		: undefined;
	if (projectIds?.length) {
		where.push(`tasks.project_id IN (${projectIds.map(() => "?").join(", ")})`);
		params.push(...projectIds);
	}
	if (query.status?.length) {
		where.push(`tasks.status IN (${query.status.map(() => "?").join(", ")})`);
		params.push(...query.status);
	}

	const activeSlots = ACTIVE_STATUSES.map(() => "?").join(", ");
	const sql = `SELECT je.value AS tag, COUNT(*) AS count,
			SUM(CASE WHEN tasks.status IN (${activeSlots}) THEN 1 ELSE 0 END)
				AS active
		FROM tasks, json_each(tasks.tags) AS je
		WHERE ${where.join(" AND ")}
		GROUP BY je.value
		ORDER BY count DESC, tag ASC`;

	const rows = db.prepare(sql).all(...ACTIVE_STATUSES, ...params) as {
		tag: string;
		count: number;
		active: number;
	}[];

	return rows.map((row) => ({
		tag: row.tag,
		count: Number(row.count),
		active: Number(row.active),
	}));
}

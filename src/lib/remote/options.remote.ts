import { z } from "zod";
import { getDb } from "../server/db";
import { countTasks, listTasks } from "../server/tasks";
import { parseSearchQuery } from "../tasks/search";
import { taskList } from "./contracts";
import { defineQuery } from "./define";
import { strictObject } from "./strict";

const OPTIONS_LIMIT = 5000;
const SEARCH_LIMIT = 50;

function searchParts(q: string) {
	const terms = parseSearchQuery(q);
	return {
		q_any: terms
			.filter((term) => term.kind === "text")
			.map((term) => term.text),
		number_exact: terms
			.filter((term) => term.kind === "number")
			.map((term) => term.number),
		id_exact: terms.filter((term) => term.kind === "id").map((term) => term.id),
	};
}

export const getTaskOptions = defineQuery({
	name: "tasks_options",
	output: taskList,
	description:
		"List tasks as a compact picker source: used to fill the epic, blocker and related-task lists of the forms. Without q it returns every task of one project, ordered by number. With q it searches the whole backlog, so a task of another project can be found by its id or title. Returns: {items, total}. The description is left out of the items.",
	kind: "query",
	input: strictObject({
		project_id: z
			.string()
			.min(1)
			.optional()
			.describe("Project id: the tasks of this project only."),
		q: z
			.string()
			.optional()
			.describe(
				"Search over the whole backlog: words are OR-ed, =12 and =LOG-12 match one task exactly.",
			),
		limit: z
			.number()
			.int()
			.min(1)
			.max(OPTIONS_LIMIT)
			.optional()
			.describe("Item cap, 50 by default."),
	}),
	handler: ({ project_id, q, limit }) => {
		const db = getDb();
		const search = q?.trim();
		const query = {
			project_id,
			...(search === undefined || search === "" ? {} : searchParts(search)),
			include_description: false,
			sort: "number" as const,
			order: "asc" as const,
			limit:
				search === undefined || search === ""
					? OPTIONS_LIMIT
					: (limit ?? SEARCH_LIMIT),
		};
		return {
			items: listTasks(db, query),
			total: countTasks(db, query),
		};
	},
});

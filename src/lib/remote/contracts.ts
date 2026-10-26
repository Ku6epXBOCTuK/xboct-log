import { z } from "zod";
import { PRIORITIES, STATUSES } from "../types";

export const taskRef = z.looseObject({
	id: z.string(),
	title: z.string(),
	number: z.number().int(),
	project_id: z.string(),
	status: z.enum(STATUSES),
	priority: z.enum(PRIORITIES),
});

export const taskCreated = z.looseObject({
	...taskRef.shape,
	warnings: z.array(z.string()),
});

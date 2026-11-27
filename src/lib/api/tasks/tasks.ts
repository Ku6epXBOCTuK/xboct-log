import { client, unwrap } from "#lib/api/system/client.ts";
import type {
	BatchItem,
	CreateBatchItem,
	DeleteTaskOutcome,
	NewTask,
	TaskPatch,
	TaskQuery,
	TasksByIds,
	TaskUpdateOutcome,
} from "#lib/api/types.ts";
import type { ClosedReason, Task } from "#lib/types.ts";

export type TaskPage = {
	items: Task[];
	total: number;
	offset: number;
	size: number;
	page_size: number;
	next_offset?: number | null;
};

export async function getTasks(input: TaskQuery): Promise<TaskPage> {
	return unwrap<TaskPage>(
		await client.POST("/api/tasks_list", {
			body: { ...input, limit: input.limit ?? 100 } as never,
		}),
	);
}

export async function listDeletedTasks(input: {
	project_id?: string;
	q?: string;
	page?: number;
}): Promise<TaskPage> {
	return unwrap<TaskPage>(
		await client.POST("/api/tasks_deleted_list", { body: input }),
	);
}

export async function getTasksByIds(input: {
	task_ids: string[];
}): Promise<TasksByIds> {
	return unwrap<TasksByIds>(
		await client.POST("/api/tasks_get_many", { body: input }),
	);
}

export type TaskRef = Task & {
	children_counts?: Record<string, number>;
};

export async function getTask(input: { task_id: string }): Promise<TaskRef> {
	return unwrap<TaskRef>(await client.POST("/api/tasks_get", { body: input }));
}

export type TaskCreated = Task & { warnings: string[] };

export async function createTask(input: NewTask): Promise<TaskCreated> {
	return unwrap<TaskCreated>(
		await client.POST("/api/tasks_create", { body: input as never }),
	);
}

export type CreateBatch = {
	items: CreateBatchItem[];
	succeeded: number;
	failed: number;
};

export async function createTasks(input: {
	items: NewTask[];
}): Promise<CreateBatch> {
	return unwrap<CreateBatch>(
		await client.POST("/api/tasks_create_many", { body: input as never }),
	);
}

export type TaskUpdated = Task & TaskUpdateOutcome & { warnings: string[] };

export async function updateTask(input: {
	task_id: string;
	patch?: TaskPatch;
}): Promise<TaskUpdated> {
	return unwrap<TaskUpdated>(
		await client.POST("/api/tasks_update", { body: input as never }),
	);
}

export type UpdateBatch = {
	items: (BatchItem & { warnings?: string[] })[];
	succeeded: number;
	failed: number;
};

export async function updateTasks(input: {
	items: { task_id: string; patch: TaskPatch }[];
}): Promise<UpdateBatch> {
	return unwrap<UpdateBatch>(
		await client.POST("/api/tasks_update_many", { body: input as never }),
	);
}

export type TaskClosed = Task & {
	changes: TaskUpdateOutcome["changes"];
	released: NonNullable<TaskUpdateOutcome["released"]>;
	warnings: string[];
	closed_epic?: Task;
};

export async function closeTask(input: {
	task_id: string;
	reason: ClosedReason;
}): Promise<TaskClosed> {
	return unwrap<TaskClosed>(
		await client.POST("/api/tasks_close", { body: input }),
	);
}

export async function closeTasks(input: {
	items: { task_id: string; reason: ClosedReason }[];
}): Promise<UpdateBatch> {
	return unwrap<UpdateBatch>(
		await client.POST("/api/tasks_close_many", { body: input }),
	);
}

export async function deleteTask(input: {
	task_id: string;
}): Promise<DeleteTaskOutcome> {
	return unwrap<DeleteTaskOutcome>(
		await client.POST("/api/tasks_delete", { body: input }),
	);
}

export async function restoreTask(input: { task_id: string }): Promise<Task> {
	return unwrap<Task>(await client.POST("/api/tasks_restore", { body: input }));
}

export async function moveTask(input: {
	task_id: string;
	project_id: string;
}): Promise<Task> {
	return unwrap<Task>(await client.POST("/api/tasks_move", { body: input }));
}

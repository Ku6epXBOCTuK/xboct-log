const TASK_ID = /^[A-Za-z0-9]{1,6}-\d+$/;

export function isTaskId(value: string): boolean {
	return TASK_ID.test(value);
}

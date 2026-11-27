import { expect, test } from "@playwright/test";
import { createFixture } from "./support.ts";

const f = createFixture("paging");
const project = `${f.project}-pages`;

test.beforeAll(async ({ request }) => {
	await f.seed(request);
	await f.callTool(request, "projects_create", {
		project_id: project,
		name: "Paging",
		prefix: `${f.prefix}P`,
	});
	await f.callTool(request, "tasks_create_many", {
		items: Array.from({ length: 74 }, (_, index) => ({
			project_id: project,
			title: `Paged task ${index + 1}`,
			description: "x".repeat(4_000),
			status: "open",
		})),
	});
});

test("the UI uses the server page size and shows every task once", async ({
	page,
}) => {
	await page.goto(`/tasks/project/${project}`);
	await expect(page.locator("tr[data-task-id]")).toHaveCount(50);
	await expect(page.locator(".pager .muted")).toHaveText("1–50 of 74");

	const first = await f.taskIds(page);
	await page.getByRole("button", { name: "Next page" }).click();
	await expect(page.locator("tr[data-task-id]")).toHaveCount(24);
	await expect(page.locator(".pager .muted")).toHaveText("51–74 of 74");

	const second = await f.taskIds(page);
	expect(new Set([...first, ...second]).size).toBe(74);
});

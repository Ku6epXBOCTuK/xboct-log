import { expect, test } from "@playwright/test";
import { createFixture } from "./support.ts";

test.describe.configure({ mode: "serial" });

const f = createFixture("tasks");
const { project, tag, suffix, created, taskIds } = f;

test.beforeAll(async ({ request }) => f.seed(request));
test("the task list shows seeded tasks and filters by search", async ({
	page,
}) => {
	await page.goto(`/tasks/project/${project}`);
	await expect(page.getByRole("heading", { name: "UI E2E" })).toBeVisible();
	await expect(page.locator(`[data-task-id="${created.open}"]`)).toContainText(
		"Seeded open task",
	);

	await page.getByLabel("Search tasks").fill("open task");
	await expect(page.locator(`[data-task-id="${created.open}"]`)).toBeVisible();
	await expect(page.locator(`[data-task-id="${created.done}"]`)).toBeHidden();
});

test("a task is created from the new task form", async ({ page }) => {
	await page.goto(`/tasks/project/${project}`);
	await page
		.locator("header")
		.getByRole("button", { name: "New task" })
		.click();
	await page.locator("#new-task-title").fill("Created through the UI");
	await page.getByRole("button", { name: "Create task" }).click();
	await expect(page.getByText("Created through the UI").first()).toBeVisible();
});

test("a task is closed and reopened from its panel", async ({ page }) => {
	await page.goto(`/tasks/project/${project}`);
	await page.locator(`[data-task-id="${created.closeable}"]`).click();
	const panel = page.getByRole("complementary", { name: "Task details" });

	await panel.getByRole("button", { name: "Close task", exact: true }).click();
	await expect(panel.getByRole("button", { name: "Reopen" })).toBeVisible();

	await panel.getByRole("button", { name: "Reopen" }).click();
	await expect(
		panel.getByRole("button", { name: "Close task", exact: true }),
	).toBeVisible();
});

test("markdown fields default to preview for existing content and edit for new content", async ({
	page,
}) => {
	await page.goto(`/tasks/project/${project}`);
	await page.locator(`[data-task-id="${created.open}"]`).click();
	const panel = page.getByRole("complementary", { name: "Task details" });

	await expect(
		panel.getByRole("button", { name: "Edit", exact: true }),
	).toBeVisible();
	await expect(
		panel.getByText("A task seeded through the rest api"),
	).toBeVisible();
	await expect(panel.getByRole("textbox", { name: "Description" })).toHaveCount(
		0,
	);

	await panel.getByRole("button", { name: "Edit", exact: true }).click();
	await expect(
		panel.getByRole("textbox", { name: "Description" }),
	).toBeVisible();
	await expect(
		panel.getByRole("button", { name: "Preview", exact: true }),
	).toBeVisible();

	await panel.getByRole("button", { name: "Close task details" }).click();
	await page
		.locator("header")
		.getByRole("button", { name: "New task" })
		.click();
	await expect(
		page.getByRole("button", { name: "Preview", exact: true }),
	).toBeVisible();
	await expect(
		page.getByRole("textbox", { name: "Description" }),
	).toBeVisible();
});

test("the description follows the selected task", async ({ page }) => {
	await page.goto(`/tasks/project/${project}`);
	const rowId = (id: string) =>
		page.locator(`[data-task-id="${id}"] .task-id-text`);
	await rowId(created.open).click();
	const panel = page.getByRole("complementary", { name: "Task details" });

	const description = "A task seeded through the rest api";
	await expect(panel.getByText(description)).toBeVisible();

	await rowId(created.closeable).click();
	await expect(panel.getByText(description)).toHaveCount(0);
	await expect(
		panel.getByRole("textbox", { name: "Description" }),
	).toBeVisible();
});

test("task filters narrow the list by status and priority", async ({
	page,
}) => {
	await page.goto(`/tasks/project/${project}`);
	const statuses = page.getByRole("group", { name: "Status sets" });

	await statuses.getByRole("button", { name: "closed" }).click();
	await expect(page.locator(`[data-task-id="${created.done}"]`)).toBeVisible();
	await expect(page.locator(`[data-task-id="${created.open}"]`)).toBeHidden();

	await statuses.getByRole("button", { name: "active" }).click();
	await expect(page.locator(`[data-task-id="${created.open}"]`)).toBeVisible();

	const priorities = page.locator(".priority-group");
	await priorities.getByRole("button", { name: "high" }).click();
	await expect(page.locator(`[data-task-id="${created.open}"]`)).toBeVisible();
	await expect(page.locator(`[data-task-id="${created.low}"]`)).toBeHidden();

	await priorities.getByRole("button", { name: "high" }).click();
	await expect(page.locator(`[data-task-id="${created.low}"]`)).toBeVisible();
});

test("the task table sorts by id in both directions", async ({ page }) => {
	await page.goto(`/tasks/project/${project}`);
	const sortById = page.locator('button.sort-button[title="Sort by ID"]');

	const numbers = async () =>
		(await taskIds(page)).map((id) => Number(id.split("-")[1]));

	await sortById.click();
	await expect
		.poll(async () => {
			const ids = await numbers();
			return ids.every(
				(value, index) => index === 0 || ids[index - 1] >= value,
			);
		})
		.toBe(true);
	const descending = await numbers();

	await sortById.click();
	await expect
		.poll(async () => {
			const ids = await numbers();
			return ids.every(
				(value, index) => index === 0 || ids[index - 1] <= value,
			);
		})
		.toBe(true);
	const ascending = await numbers();
	expect(ascending[0]).toBeLessThan(descending[0]);
});

test("an attachment is uploaded and removed", async ({ page }) => {
	await page.goto(`/tasks/project/${project}`);
	await page.locator(`[data-task-id="${created.attachable}"]`).click();
	const panel = page.getByRole("complementary", { name: "Task details" });
	const file = `note-${suffix}.txt`;

	await panel.locator('input[type="file"]').setInputFiles({
		name: file,
		mimeType: "text/plain",
		buffer: Buffer.from("attachment from the ui e2e"),
	});
	await expect(panel.getByText(file)).toBeVisible();

	await panel.getByRole("button", { name: "Remove the attachment" }).click();
	await panel.getByRole("button", { name: "Remove", exact: true }).click();
	await expect(panel.getByText(file)).toHaveCount(0);
});

test("Escape closes the task panel after adding a tag", async ({ page }) => {
	await page.goto(`/tasks/project/${project}`);
	await page.locator(`[data-task-id="${created.critical}"]`).click();
	const panel = page.getByRole("complementary", { name: "Task details" });
	const input = panel.getByRole("combobox", { name: "Tags" });

	await input.click();
	await panel
		.getByRole("listbox", { name: "Tags" })
		.getByRole("option")
		.filter({ hasText: tag })
		.click();
	await expect(
		panel.getByRole("button", { name: `Remove ${tag}` }),
	).toBeVisible();

	await input.press("Escape");
	await expect(panel).toBeVisible();

	await input.press("Escape");
	await expect(panel).toBeHidden();
});

test("a task is deleted and restored", async ({ page }) => {
	await page.goto(`/tasks/project/${project}`);
	await page.locator(`[data-task-id="${created.deletable}"]`).click();
	const panel = page.getByRole("complementary", { name: "Task details" });

	await panel.getByRole("button", { name: "Delete", exact: true }).click();
	await panel.getByRole("button", { name: "Confirm delete" }).click();
	await expect(
		page.locator(`[data-task-id="${created.deletable}"]`),
	).toHaveCount(0);

	await page.goto(`/deleted/project/${project}`);
	await expect(page.getByText("Seeded deletable task").first()).toBeVisible();
	await page.getByRole("button", { name: "Restore task" }).first().click();
	await expect(page.getByText("Seeded deletable task")).toHaveCount(0);

	await page.goto(`/tasks/project/${project}`);
	await expect(
		page.locator(`[data-task-id="${created.deletable}"]`),
	).toBeVisible();
});

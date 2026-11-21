import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const suffix = Date.now().toString(36).slice(-4);
const project = `ui-${suffix}`;
const prefix = `UI${suffix.slice(-2).toUpperCase()}`;
const scope = "frontend";
const tag = `ui-${suffix}`;
const newProjectName = `UI Created ${suffix}`;
const newProjectPrefix = `N${suffix.slice(0, 3).toUpperCase()}`;

const created: Record<string, string> = {};

let sessionId = "";
let requestId = 0;

async function rpc(request, method, params) {
	const response = await request.post("/mcp", {
		headers: {
			"content-type": "application/json",
			accept: "application/json, text/event-stream",
			...(sessionId === "" ? {} : { "mcp-session-id": sessionId }),
		},
		data: { jsonrpc: "2.0", id: (requestId += 1), method, params },
	});
	const sid = response.headers()["mcp-session-id"];
	if (sid) {
		sessionId = sid;
	}
	const text = await response.text();
	const line = text
		.split(/\r?\n/)
		.find((item) => item.startsWith("data: ") && item.slice(6).trim());
	const payload = line ? JSON.parse(line.slice(6)) : JSON.parse(text);
	if (payload.error) {
		throw new Error(`${method}: ${payload.error.message}`);
	}
	return payload.result;
}

async function notify(request, method) {
	await request.post("/mcp", {
		headers: {
			"content-type": "application/json",
			accept: "application/json, text/event-stream",
			...(sessionId === "" ? {} : { "mcp-session-id": sessionId }),
		},
		data: { jsonrpc: "2.0", method },
	});
}

async function callTool(request, name, args) {
	const result = await rpc(request, "tools/call", {
		name,
		arguments: args,
	});
	if (result.structuredContent) {
		return result.structuredContent;
	}
	const content = result.content?.[0]?.text;
	if (typeof content !== "string") {
		return result;
	}
	try {
		return JSON.parse(content);
	} catch {
		return content;
	}
}

async function taskIds(page): Promise<string[]> {
	return page
		.locator("tr[data-task-id]")
		.evaluateAll((rows) =>
			rows.map((row) => row.getAttribute("data-task-id") ?? ""),
		);
}

test.beforeAll(async ({ request }) => {
	await rpc(request, "initialize", {
		protocolVersion: "2025-06-18",
		capabilities: {},
		clientInfo: { name: "xboct-log-e2e", version: "1" },
	});
	await notify(request, "notifications/initialized");

	await callTool(request, "projects_create", {
		project_id: project,
		name: "UI E2E",
		prefix,
	});
	await callTool(request, "scopes_create", {
		project_id: project,
		name: scope,
	});
	await callTool(request, "tags_create", { name: tag });

	created.open = (
		await callTool(request, "tasks_create", {
			project_id: project,
			title: "Seeded open task",
			status: "open",
			description: "A task seeded through the rest api",
			scope,
			tags: [tag],
			priority: "high",
		})
	).id;
	created.closeable = (
		await callTool(request, "tasks_create", {
			project_id: project,
			title: "Seeded closeable task",
			status: "open",
		})
	).id;
	created.attachable = (
		await callTool(request, "tasks_create", {
			project_id: project,
			title: "Seeded attachment task",
			status: "open",
		})
	).id;
	created.deletable = (
		await callTool(request, "tasks_create", {
			project_id: project,
			title: "Seeded deletable task",
			status: "open",
		})
	).id;
	created.low = (
		await callTool(request, "tasks_create", {
			project_id: project,
			title: "Seeded low task",
			status: "open",
			priority: "low",
		})
	).id;
	created.critical = (
		await callTool(request, "tasks_create", {
			project_id: project,
			title: "Seeded critical task",
			status: "open",
			priority: "critical",
		})
	).id;
	created.done = (
		await callTool(request, "tasks_create", {
			project_id: project,
			title: "Seeded done task",
			status: "open",
		})
	).id;
	await callTool(request, "tasks_close", {
		task_id: created.done,
		reason: "fixed",
	});
});

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

test("a project is created from the sidebar", async ({ page }) => {
	await page.goto("/tasks");
	await page.getByRole("button", { name: "New project" }).click();
	await page.getByLabel("Project name").fill(newProjectName);
	await page.getByLabel("Project prefix").fill(newProjectPrefix);
	await page.getByRole("button", { name: "Create", exact: true }).click();

	await expect(page.getByText(newProjectName, { exact: true })).toBeVisible();
	await page.getByText(newProjectName, { exact: true }).click();
	await expect(page).toHaveURL(/\/tasks\/project\/ui-created-/);
	await expect(
		page.getByRole("heading", { name: newProjectName }),
	).toBeVisible();
});

test("the tags page lists the tag", async ({ page }) => {
	await page.goto("/tags");
	await expect(page.getByRole("heading", { name: "Tags" })).toBeVisible();
	await expect(page.getByText(tag, { exact: true }).first()).toBeVisible();
});

test("a plan is created and filled from the plans page", async ({ page }) => {
	const name = `UI Plan ${suffix}`;
	await page.goto("/plans");
	await expect(page.getByRole("heading", { name: "Plans" })).toBeVisible();
	await page.getByLabel("New plan name").fill(name);
	await page.getByRole("button", { name: "Create", exact: true }).click();
	await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();

	await page.getByRole("button", { name: "Add a task to the plan" }).click();
	await page.getByPlaceholder("Search tasks").fill(created.open);
	await page
		.getByRole("option")
		.filter({ hasText: created.open })
		.first()
		.click();
	await expect(
		page.locator("ol.items li").filter({ hasText: created.open }),
	).toBeVisible();

	await page.goto(`/tasks/${created.open}`);
	const panel = page.getByRole("complementary", { name: "Task details" });
	await expect(panel.getByText(name, { exact: true })).toBeVisible();
});

test("a plan id can be copied from the plans page", async ({
	page,
	context,
}) => {
	await context.grantPermissions(["clipboard-read", "clipboard-write"]);
	const firstName = `UI Copy A ${suffix}`;
	const secondName = `UI Copy B ${suffix}`;
	await page.goto("/plans");

	await page.getByLabel("New plan name").fill(firstName);
	await page.getByRole("button", { name: "Create", exact: true }).click();
	await expect(
		page.getByRole("heading", { name: firstName, exact: true }),
	).toBeVisible();

	const firstKey = await page.locator(".plan-key-button").innerText();
	await page
		.locator(".detail-head")
		.getByRole("button", { name: "Copy plan id" })
		.click();
	await expect
		.poll(() => page.evaluate(() => navigator.clipboard.readText()))
		.toBe(firstKey);

	await page.getByLabel("New plan name").fill(secondName);
	await page.getByRole("button", { name: "Create", exact: true }).click();
	await expect(
		page.getByRole("heading", { name: secondName, exact: true }),
	).toBeVisible();

	const firstRow = page.locator(".plan-row").filter({ hasText: firstName });
	const rowKey = await firstRow.locator(".plan-key").innerText();
	await firstRow.getByRole("button", { name: "Copy plan id" }).click();
	await expect
		.poll(() => page.evaluate(() => navigator.clipboard.readText()))
		.toBe(rowKey);
	await expect(
		page.getByRole("heading", { name: secondName, exact: true }),
	).toBeVisible();
});

test("a document is created and edited on the documents page", async ({
	page,
}) => {
	await page.goto(`/documents/project/${project}`);
	await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
	await page.getByLabel("Document kind").selectOption("adr");
	await page.getByLabel("New document title").fill("UI document");
	await page.getByRole("button", { name: "Create", exact: true }).click();
	created.document = await page
		.locator(".document-link.active .document-key")
		.innerText();
	await expect(
		page.getByRole("heading", { name: /UI document/ }),
	).toBeVisible();

	const editor = page.getByPlaceholder("Document body");
	await editor.fill("first version");
	await page.getByRole("button", { name: "Save", exact: true }).click();
	await editor.fill("second version");
	await page.getByRole("button", { name: "Save", exact: true }).click();
	await expect(
		page.locator("details.revision pre").filter({ hasText: "first version" }),
	).toHaveCount(1);
	await page.getByLabel("Document status").selectOption("accepted");
});

test("documents open from a global page without a project", async ({
	page,
}) => {
	await page.goto("/plans");
	await page.getByRole("button", { name: "Show all pages" }).click();
	await page
		.getByRole("navigation", { name: "Primary navigation" })
		.getByRole("link", { name: "Documents" })
		.click();
	await expect(page).toHaveURL("/documents");
	await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
	await expect(
		page.locator("ul.document-list li").filter({ hasText: created.document }),
	).toBeVisible();
});

test("a plan note and a document link survive on the plans page", async ({
	page,
}) => {
	const name = `UI Notes ${suffix}`;
	await page.goto("/plans");
	await page.getByLabel("New plan name").fill(name);
	await page.getByRole("button", { name: "Create", exact: true }).click();
	await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();

	await page.getByRole("button", { name: "Add a task to the plan" }).click();
	await page.getByPlaceholder("Search tasks").fill(created.open);
	await page
		.getByRole("option")
		.filter({ hasText: created.open })
		.first()
		.click();
	await expect(
		page.locator("ol.items li").filter({ hasText: created.open }),
	).toBeVisible();
	await page.keyboard.press("Escape");

	await page
		.getByLabel(`Note for ${created.open}`)
		.fill("check before release");
	await page.getByRole("button", { name: "Add note" }).click();
	await expect(page.getByText("check before release")).toBeVisible();

	await page
		.locator(".note")
		.filter({ hasText: "check before release" })
		.getByRole("button", { name: "Edit" })
		.click();
	await page.getByLabel("Edit note").fill("checked after release");
	await page.getByRole("button", { name: "Save", exact: true }).click();
	await expect(page.getByText("checked after release")).toBeVisible();

	const editedNote = page
		.locator(".note")
		.filter({ hasText: "checked after release" });
	await editedNote.getByRole("button", { name: "History" }).click();
	await expect(
		page
			.locator(".note-history pre")
			.filter({ hasText: "check before release" }),
	).toBeVisible();

	await editedNote.getByRole("button", { name: "Delete" }).click();
	const deletedNote = page
		.locator(".note-deleted")
		.filter({ hasText: "checked after release" });
	await expect(deletedNote).toBeVisible();
	await deletedNote.getByRole("button", { name: "Restore" }).click();
	await expect(
		page.locator(".note").filter({ hasText: "checked after release" }),
	).toBeVisible();

	const picker = page.getByLabel("Document to link");
	const option = picker.locator("option").filter({ hasText: "UI document" });
	const value = await option.getAttribute("value");
	await picker.selectOption(value ?? "");
	await page.getByRole("button", { name: "Link", exact: true }).click();
	await expect(
		page.locator(".plan-documents li").filter({ hasText: "UI document" }),
	).toBeVisible();
});

test("the activity page shows the recorded changes", async ({ page }) => {
	await page.goto("/activity");
	await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
	await expect(page.getByText("Task created").first()).toBeVisible();
});

test("the backend badge follows the reachability of the server", async ({
	page,
}) => {
	await page.goto("/tasks");
	const badge = page.getByRole("button", { name: /^Backend: Connected/ });
	await expect(badge).toBeVisible();

	await badge.hover();
	await expect(page.getByText("Click the dot to check again")).toBeVisible();

	await page.route("**/api/health", (route) => route.abort());
	await badge.click();

	await expect(
		page.getByRole("button", { name: /^Backend: Offline/ }),
	).toBeVisible();
	const banner = page
		.getByRole("alert")
		.filter({ hasText: "Backend unreachable" });
	await expect(banner).toBeVisible();

	await page.unroute("**/api/health");
	await banner.getByRole("button", { name: "Retry now" }).click();

	await expect(banner).toHaveCount(0);
	await expect(badge).toBeVisible();
});

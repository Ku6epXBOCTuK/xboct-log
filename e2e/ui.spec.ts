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

	created.blocker = (
		await callTool(request, "tasks_create", {
			project_id: project,
			title: "Seeded blocker task",
			status: "open",
		})
	).id;
	created.blocked = (
		await callTool(request, "tasks_create", {
			project_id: project,
			title: "Seeded blocked task",
			status: "open",
		})
	).id;
	await callTool(request, "tasks_add_blocker", {
		task_id: created.blocked,
		blocked_by: created.blocker,
	});

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

	created.completionDone = (
		await callTool(request, "tasks_create", {
			project_id: project,
			title: "Seeded completion done task",
			status: "open",
		})
	).id;
	await callTool(request, "tasks_close", {
		task_id: created.completionDone,
		reason: "fixed",
	});
	created.completionCancelled = (
		await callTool(request, "tasks_create", {
			project_id: project,
			title: "Seeded completion cancelled task",
			status: "open",
		})
	).id;
	await callTool(request, "tasks_close", {
		task_id: created.completionCancelled,
		reason: "obsolete",
	});
	created.completionOpenA = (
		await callTool(request, "tasks_create", {
			project_id: project,
			title: "Seeded completion open task A",
			status: "open",
		})
	).id;
	created.completionOpenB = (
		await callTool(request, "tasks_create", {
			project_id: project,
			title: "Seeded completion open task B",
			status: "open",
		})
	).id;
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

	const createResponse = page.waitForResponse(
		(response) =>
			response.url().includes("/api/projects_create") &&
			response.request().method() === "POST" &&
			response.ok(),
	);
	await page.getByRole("button", { name: "Create", exact: true }).click();
	await createResponse;

	const projectRow = page
		.locator(".project-row")
		.filter({ hasText: newProjectName });
	await expect(projectRow).toBeVisible();
	await projectRow.getByRole("button").first().click();
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

test("the status filter stays on the plans page when no plans match", async ({
	page,
}) => {
	await page.goto("/plans");
	const filter = page.getByRole("radiogroup", { name: "Status filter" });

	await filter.getByRole("radio", { name: "Active" }).click();
	await expect(filter).toBeVisible();
	await expect(page.getByText("No active plans")).toBeVisible();
	await expect(
		page.getByText("Change the filter to see other plans"),
	).toBeVisible();
	await expect(page.locator(".plan-row")).toHaveCount(0);

	await filter.getByRole("radio", { name: "All" }).click();
	await expect(filter).toBeVisible();
	await expect(page.getByText("No plans yet")).toBeVisible();
});

test("a plan is created and filled from the plans page", async ({ page }) => {
	const name = `UI Plan ${suffix}`;
	await page.goto("/plans");
	await expect(page.getByRole("heading", { name: "Plans" })).toBeVisible();
	await page.getByLabel("New plan name").fill(name);
	await page.getByRole("button", { name: "Create", exact: true }).click();
	await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();

	await page.getByRole("button", { name: "Add a task to the plan" }).click();
	await page
		.getByPlaceholder("Search tasks", { exact: true })
		.fill(created.open);
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

test("a plan shows blockers and asks before removing an item", async ({
	page,
}) => {
	const name = `UI Blockers ${suffix}`;
	await page.goto("/plans");
	await page.getByLabel("New plan name").fill(name);
	await page.getByRole("button", { name: "Create", exact: true }).click();
	await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();

	await page.getByRole("button", { name: "Add a task to the plan" }).click();
	await page
		.getByPlaceholder("Search tasks", { exact: true })
		.fill(created.blocked);
	await page
		.getByRole("option")
		.filter({ hasText: created.blocked })
		.first()
		.click();
	await page.keyboard.press("Escape");

	const card = page.locator("ol.items li").filter({ hasText: created.blocked });
	await expect(card).toContainText("blocked");
	await expect(card.locator(".item-blockers a")).toHaveAttribute(
		"href",
		new RegExp(created.blocker),
	);

	await card.getByRole("button", { name: "Remove" }).click();
	const dialog = page.getByRole("dialog", {
		name: `Remove ${created.blocked} from the plan?`,
	});
	await expect(dialog).toBeVisible();
	await dialog.getByRole("button", { name: "Cancel" }).click();
	await expect(card).toBeVisible();

	await card.getByRole("button", { name: "Remove" }).click();
	await dialog.getByRole("button", { name: "Remove", exact: true }).click();
	await expect(
		page.locator("ol.items li").filter({ hasText: created.blocked }),
	).toHaveCount(0);
});

test("a plan shows completion from its tasks", async ({ page, request }) => {
	const name = `UI Completion ${suffix}`;
	await page.goto("/plans");
	await page.getByLabel("New plan name").fill(name);
	await page.getByRole("button", { name: "Create", exact: true }).click();
	await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();

	const key = await page.locator(".plan-key-button").innerText();
	for (const task of [
		created.completionDone,
		created.completionCancelled,
		created.completionOpenA,
		created.completionOpenB,
	]) {
		await callTool(request, "plans_items_add", { plan_id: key, task_id: task });
	}
	await page.reload();
	const row = page.locator(".plan-row").filter({ hasText: name });
	await row.getByRole("button").first().click();

	const progress = page.getByRole("progressbar", { name: "Plan completion" });
	await expect(progress).toHaveAttribute("aria-valuenow", "50");
	await expect(page.getByText("2 of 4 tasks closed")).toBeVisible();
	await expect(page.getByText("Completed", { exact: true })).toHaveCount(0);

	for (const task of [created.completionOpenA, created.completionOpenB]) {
		await callTool(request, "tasks_close", { task_id: task, reason: "fixed" });
	}
	await page.reload();
	await row.getByRole("button").first().click();

	await expect(page.getByText("4 of 4 tasks closed")).toBeVisible();
	await expect(page.getByText("Completed", { exact: true })).toBeVisible();
	await expect(progress).toHaveAttribute("aria-valuenow", "100");
	await expect(row).toContainText("4 tasks");
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

test("the plan list filters by status", async ({ page, request }) => {
	const names = {
		active: `UI Active ${suffix}`,
		backlog: `UI Backlog ${suffix}`,
		done: `UI Done ${suffix}`,
		cancelled: `UI Cancelled ${suffix}`,
	};
	for (const status of Object.keys(names)) {
		await callTool(request, "plans_create", { name: names[status], status });
	}
	await page.goto("/plans");

	const rows = page.locator(".plan-row");
	const filter = page.getByRole("radiogroup", { name: "Status filter" });
	await expect(rows.filter({ hasText: names.active })).toBeVisible();
	await expect(rows.filter({ hasText: names.backlog })).toBeVisible();
	await expect(rows.filter({ hasText: names.done })).toBeVisible();
	await expect(rows.filter({ hasText: names.cancelled })).toBeVisible();

	await filter.getByRole("radio", { name: "Active" }).click();
	await expect(rows.filter({ hasText: names.active })).toBeVisible();
	await expect(rows.filter({ hasText: names.backlog })).toBeVisible();
	await expect(rows.filter({ hasText: names.done })).toHaveCount(0);
	await expect(rows.filter({ hasText: names.cancelled })).toHaveCount(0);
	const shown = await page.locator(".create-wrap .muted").innerText();
	expect(Number(shown.split(" ")[0])).toBe(await rows.count());

	await filter.getByRole("radio", { name: "Closed" }).click();
	await expect(rows.filter({ hasText: names.done })).toBeVisible();
	await expect(rows.filter({ hasText: names.cancelled })).toBeVisible();
	await expect(rows.filter({ hasText: names.active })).toHaveCount(0);
	await expect(rows.filter({ hasText: names.backlog })).toHaveCount(0);

	await filter.getByRole("radio", { name: "All" }).click();
	await expect(rows.filter({ hasText: names.active })).toBeVisible();
	await expect(rows.filter({ hasText: names.backlog })).toBeVisible();
	await expect(rows.filter({ hasText: names.done })).toBeVisible();
	await expect(rows.filter({ hasText: names.cancelled })).toBeVisible();
});

test("the plan list searches by name and key", async ({ page, request }) => {
	const alpha = `UI Search Alpha ${suffix}`;
	const beta = `UI Search Beta ${suffix}`;
	const betaPlan = await callTool(request, "plans_create", { name: beta });
	const betaKey = `PL-${parseInt(suffix, 36) + 7000}`;
	await callTool(request, "plans_update", {
		plan_id: betaPlan.id,
		patch: { key: betaKey },
	});
	await callTool(request, "plans_create", { name: alpha });

	await page.goto("/plans");
	const search = page.getByRole("textbox", { name: "Search plans" });
	const rows = page.locator(".plan-row");
	const counter = page.locator(".create-wrap .muted");
	await expect(rows.filter({ hasText: alpha })).toBeVisible();
	await expect(rows.filter({ hasText: beta })).toBeVisible();

	await search.fill("Search Alpha");
	await expect(rows.filter({ hasText: alpha })).toBeVisible();
	await expect(rows.filter({ hasText: beta })).toHaveCount(0);
	expect(Number((await counter.innerText()).split(" ")[0])).toBe(
		await rows.count(),
	);

	await search.fill(betaKey.toLowerCase());
	await expect(rows.filter({ hasText: beta })).toBeVisible();
	await expect(rows.filter({ hasText: alpha })).toHaveCount(0);
	expect(Number((await counter.innerText()).split(" ")[0])).toBe(
		await rows.count(),
	);

	await search.fill("no such plan");
	await expect(page.getByText("No matching plans")).toBeVisible();
	await expect(page.getByText("Clear search to see other plans")).toBeVisible();
	await expect(rows).toHaveCount(0);

	await page.getByRole("button", { name: "Clear search" }).click();
	await expect(rows.filter({ hasText: alpha })).toBeVisible();
	await expect(rows.filter({ hasText: beta })).toBeVisible();
});

test("the plan status changes from the detail head", async ({
	page,
	request,
}) => {
	const name = `UI Status ${suffix}`;
	const plan = await callTool(request, "plans_create", {
		name,
		status: "backlog",
	});
	await page.goto("/plans");
	await page
		.locator(".plan-row")
		.filter({ hasText: name })
		.getByRole("button")
		.first()
		.click();

	const status = page.getByRole("button", { name: "Plan status" });
	await expect(status).toContainText("Backlog");
	await status.click();
	await page.getByRole("option", { name: "Done" }).click();
	await expect(status).toContainText("Done");

	const stored = await callTool(request, "plans_get", { plan_id: plan.id });
	expect(stored.status).toBe("done");

	await page.reload();
	await page
		.locator(".plan-row")
		.filter({ hasText: name })
		.getByRole("button")
		.first()
		.click();
	await expect(page.getByRole("button", { name: "Plan status" })).toContainText(
		"Done",
	);
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

test("editing a document while saving keeps the new text", async ({ page }) => {
	await page.goto(`/documents/project/${project}`);
	await page.getByLabel("Document kind").selectOption("adr");
	await page.getByLabel("New document title").fill("UI race document");
	await page.getByRole("button", { name: "Create", exact: true }).click();
	await expect(
		page.getByRole("heading", { name: /UI race document/ }),
	).toBeVisible();

	const editor = page.getByPlaceholder("Document body");
	const save = page.getByRole("button", { name: "Save", exact: true });
	await editor.fill("first version");
	await page.route("**/api/documents_update", async (route) => {
		await new Promise((resolve) => setTimeout(resolve, 400));
		await route.continue();
	});
	await save.click();
	await expect(save).toBeDisabled();
	await editor.fill("second version");
	await expect(save).toBeEnabled();
	await save.click();
	await expect(
		page.locator("details.revision pre").filter({ hasText: "first version" }),
	).toHaveCount(1);
	await expect(editor).toHaveValue("second version");
});

test("documents open from a global page without a project", async ({
	page,
}) => {
	await page.goto("/plans");
	await page.getByTestId("nav-mode-toggle").click();
	await page.getByTestId("nav-item-documents").click();
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
	await page
		.getByPlaceholder("Search tasks", { exact: true })
		.fill(created.open);
	await page
		.getByRole("option")
		.filter({ hasText: created.open })
		.first()
		.click();
	await expect(
		page.locator("ol.items li").filter({ hasText: created.open }),
	).toBeVisible();
	await page.keyboard.press("Escape");

	await page.getByRole("button", { name: "Add a note" }).click();
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

	await page.getByRole("button", { name: "Document to link" }).click();
	await page
		.getByRole("option")
		.filter({ hasText: "UI document" })
		.first()
		.click();
	const documentCard = page
		.locator(".plan-documents li")
		.filter({ hasText: "UI document" });
	await expect(documentCard).toBeVisible();

	const documentLink = documentCard.getByRole("link");
	await expect(documentLink).toHaveAttribute(
		"href",
		/\/documents\/project\/[^/]+\/[^/]+/,
	);
	await documentLink.click();
	await expect(page).toHaveURL(/\/documents\/project\/[^/]+\/[^/]+/);
	await expect(page.locator(".detail-head")).toContainText("UI document");
});

test("the activity page shows the recorded changes", async ({ page }) => {
	await page.goto("/activity");
	await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
	await expect(page.getByText("Task created").first()).toBeVisible();
});

test("the backend badge follows the reachability of the server", async ({
	page,
}) => {
	await page.clock.install();
	await page.goto("/tasks");
	const badge = page.getByRole("button", { name: /^Backend: Connected/ });
	await expect(badge).toBeVisible();
	await page.clock.pauseAt(new Date());

	await badge.hover();
	await expect(page.getByText("Click the dot to check again")).toBeVisible();

	let healthAvailable = false;
	await page.route("**/api/health", (route) =>
		healthAvailable ? route.continue() : route.abort(),
	);
	await badge.click();

	await expect(
		page.getByRole("button", { name: /^Backend: Offline/ }),
	).toBeVisible();
	const banner = page
		.getByRole("alert")
		.filter({ hasText: "Backend unreachable" });
	await expect(banner).toBeVisible();

	healthAvailable = true;
	await banner.getByRole("button", { name: "Retry now" }).click();

	await expect(banner).toHaveCount(0);
	await expect(badge).toBeVisible();
});

test("pinned pages stay visible when navigation is collapsed", async ({
	page,
}) => {
	await page.goto("/tasks");
	await expect(page.getByTestId("nav-item-tasks")).toBeVisible();
	await expect(page.getByTestId("nav-item-plans")).toBeVisible();
	await expect(page.getByTestId("nav-row-tags")).toBeHidden();

	await page.getByTestId("nav-mode-toggle").click();
	await page.getByTestId("nav-pin-tags").click();
	await page.getByTestId("nav-mode-toggle").click();
	await expect(page.getByTestId("nav-row-tags")).toBeVisible();

	await page.reload();
	await expect(page.getByTestId("nav-row-tags")).toBeVisible();
	await expect(page.getByTestId("nav-pin-tags")).toHaveAttribute(
		"aria-pressed",
		"true",
	);

	await page.getByTestId("nav-pin-tags").click();
	await expect(page.getByTestId("nav-row-tags")).toBeHidden();
	await page.reload();
	await expect(page.getByTestId("nav-row-tags")).toBeHidden();
});

test("navigation mode survives a reload", async ({ page }) => {
	await page.goto("/tasks");
	await expect(page.getByTestId("nav-row-tags")).toBeHidden();
	await page.getByTestId("nav-mode-toggle").click();
	await expect(page.getByTestId("nav-row-tags")).toBeVisible();
	await page.reload();
	await expect(page.getByTestId("nav-row-tags")).toBeVisible();
});

test("the plan name, description and id change from the detail head", async ({
	page,
	request,
}) => {
	const name = `UI Fields ${suffix}`;
	const description = `Initial description ${suffix}`;
	const plan = await callTool(request, "plans_create", { name, description });
	const newName = `Renamed ${name}`;
	const newDescription = `Changed description ${suffix}`;
	const newKey = `PL-${Number(plan.key.split("-")[1]) + 5000}`;

	await page.goto("/plans");
	const selectPlan = async (text: string) => {
		await page
			.locator(".plan-row")
			.filter({ hasText: text })
			.getByRole("button")
			.first()
			.click();
		await expect(
			page.getByRole("heading", { name: text, exact: true }),
		).toBeVisible();
	};
	await selectPlan(name);

	await page.getByRole("button", { name: "Edit plan name" }).click();
	const nameInput = page.getByRole("textbox", {
		name: "Plan name",
		exact: true,
	});
	await expect(nameInput).toHaveValue(name);
	await nameInput.fill(newName);
	await page.getByRole("button", { name: "Save", exact: true }).click();
	await expect(
		page.getByRole("heading", { name: newName, exact: true }),
	).toBeVisible();

	await page.getByRole("button", { name: "Edit plan description" }).click();
	const descriptionInput = page.getByRole("textbox", {
		name: "Plan description",
	});
	await expect(descriptionInput).toHaveValue(description);
	await descriptionInput.fill(newDescription);
	await page.getByRole("button", { name: "Save", exact: true }).click();
	await expect(page.getByText(newDescription)).toBeVisible();

	await page.locator(".plan-key-button").click();
	const keyInput = page.getByRole("textbox", { name: "Plan id" });
	await expect(keyInput).toHaveValue(plan.key);
	await keyInput.fill(newKey);
	await page.getByRole("button", { name: "Save", exact: true }).click();
	await expect(page.locator(".plan-key-button")).toHaveText(newKey);

	const stored = await callTool(request, "plans_get", { plan_id: plan.id });
	expect(stored.name).toBe(newName);
	expect(stored.description).toBe(newDescription);
	expect(stored.key).toBe(newKey);

	await page.reload();
	await selectPlan(newName);
	await expect(
		page.getByRole("heading", { name: newName, exact: true }),
	).toBeVisible();
	await expect(page.getByText(newDescription)).toBeVisible();
	await expect(page.locator(".plan-key-button")).toHaveText(newKey);
});

test("an empty plan description can be saved, an empty name cannot", async ({
	page,
	request,
}) => {
	const name = `UI Clear ${suffix}`;
	const plan = await callTool(request, "plans_create", {
		name,
		description: `To clear ${suffix}`,
	});
	await page.goto("/plans");
	await page
		.locator(".plan-row")
		.filter({ hasText: name })
		.getByRole("button")
		.first()
		.click();
	await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();

	await page.getByRole("button", { name: "Edit plan description" }).click();
	const descriptionInput = page.getByRole("textbox", {
		name: "Plan description",
	});
	await expect(descriptionInput).toBeVisible();
	await descriptionInput.fill("");
	await descriptionInput.press("Control+Enter");
	await expect(
		page.getByRole("button", { name: "Add a description" }),
	).toBeVisible();
	const cleared = await callTool(request, "plans_get", { plan_id: plan.id });
	expect(cleared.description).toBe("");

	await page.getByRole("button", { name: "Edit plan name" }).click();
	const nameInput = page.getByRole("textbox", {
		name: "Plan name",
		exact: true,
	});
	await nameInput.fill("   ");
	await expect(
		page.getByRole("button", { name: "Save", exact: true }),
	).toBeDisabled();
	await page.getByRole("button", { name: "Cancel", exact: true }).click();
	await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
});

test("a failed plan field save keeps the draft and shows the error", async ({
	page,
	request,
}) => {
	const name = `UI Retry ${suffix}`;
	await callTool(request, "plans_create", { name });
	await page.goto("/plans");
	await page
		.locator(".plan-row")
		.filter({ hasText: name })
		.getByRole("button")
		.first()
		.click();
	await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();

	await page.getByRole("button", { name: "Edit plan name" }).click();
	const nameInput = page.getByRole("textbox", {
		name: "Plan name",
		exact: true,
	});
	const newName = `Recovered ${name}`;
	await expect(nameInput).toBeVisible();
	await nameInput.fill(newName);
	await page.route("**/api/plans_update", (route) => route.abort());
	await nameInput.press("Enter");
	await expect(page.getByText("Enter a plan name")).toBeVisible();
	await expect(nameInput).toHaveValue(newName);
	await expect(
		page.getByRole("button", { name: "Save", exact: true }),
	).toBeEnabled();

	await page.unroute("**/api/plans_update");
	await nameInput.press("Enter");
	await expect(
		page.getByRole("heading", { name: newName, exact: true }),
	).toBeVisible();
});

test("a plan is deleted and restored from the plans page", async ({
	page,
	request,
}) => {
	const name = `UI Delete Restore ${suffix}`;
	const plan = await callTool(request, "plans_create", { name });
	await page.goto("/plans");

	const activeRow = page.locator(".plan-row").filter({ hasText: name });
	await expect(activeRow).toBeVisible();
	await activeRow.locator(".plan-link").click();
	await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Delete plan" }).click();

	const dialog = page.getByRole("dialog", { name: `Delete ${plan.key}?` });
	await expect(dialog).toBeVisible();
	await dialog.getByRole("button", { name: "Cancel" }).click();
	await expect(dialog).toBeHidden();
	await expect(activeRow).toBeVisible();

	await page.getByRole("button", { name: "Delete plan" }).click();
	await dialog.getByRole("button", { name: "Delete", exact: true }).click();
	await expect(activeRow).toHaveCount(0);
	const deleted = await callTool(request, "plans_get", { plan_id: plan.id });
	expect(deleted.deleted_at).not.toBeNull();

	const showDeleted = page.getByRole("checkbox", { name: "Show deleted" });
	await showDeleted.check();
	const deletedRow = page
		.locator(".deleted-plan-row")
		.filter({ hasText: name });
	await expect(deletedRow).toBeVisible();
	await deletedRow.getByRole("button", { name: "Restore" }).click();
	await expect(deletedRow).toHaveCount(0);

	await showDeleted.uncheck();
	await expect(
		page.locator(".plan-row").filter({ hasText: name }),
	).toBeVisible();
	const restored = await callTool(request, "plans_get", { plan_id: plan.id });
	expect(restored.deleted_at).toBeNull();
});

import { expect, test } from "@playwright/test";
import { createFixture } from "./support.ts";

test.describe.configure({ mode: "serial" });

const f = createFixture("plans");
const { suffix, created, callTool } = f;

test.beforeAll(async ({ request }) => f.seed(request));
test("the status filter stays on the plans page when no plans match", async ({
	page,
}) => {
	await page.goto("/plans");
	const filter = page.getByRole("radiogroup", { name: "Status filter" });
	const search = page.getByRole("textbox", { name: "Search plans" });
	const missing = `no-such-plan-${suffix}`;
	await search.fill(missing);
	await expect(page.getByText("No matching plans")).toBeVisible();

	await filter.getByRole("radio", { name: "Active" }).click();
	await expect(filter).toBeVisible();
	await expect(search).toHaveValue(missing);
	await expect(page.getByText("No matching plans")).toBeVisible();
	await expect(page.getByText("Clear search to see other plans")).toBeVisible();
	await expect(page.locator(".plan-row")).toHaveCount(0);

	await filter.getByRole("radio", { name: "All" }).click();
	await expect(filter).toBeVisible();
	await expect(search).toHaveValue(missing);
	await expect(page.getByText("No matching plans")).toBeVisible();
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
	await filter.getByRole("radio", { name: "All" }).click();
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
		.getByRole("radiogroup", { name: "Status filter" })
		.getByRole("radio", { name: "All" })
		.click();
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

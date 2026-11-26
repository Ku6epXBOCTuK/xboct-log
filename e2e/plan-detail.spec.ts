import { expect, test } from "@playwright/test";
import { createFixture } from "./support.ts";

test.describe.configure({ mode: "serial" });

const f = createFixture("detail");
const { suffix, callTool } = f;

test.beforeAll(async ({ request }) => f.seed(request));
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

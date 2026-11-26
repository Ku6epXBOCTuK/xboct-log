import { expect, test } from "@playwright/test";
import { createFixture } from "./support.ts";

test.describe.configure({ mode: "serial" });

const f = createFixture("nav");
const { tag, newProjectName, newProjectPrefix } = f;

test.beforeAll(async ({ request }) => f.seed(request));
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
	await page.clock.pauseAt(new Date(Date.now() + 1000));

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

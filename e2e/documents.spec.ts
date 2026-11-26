import { expect, test } from "@playwright/test";
import { createFixture } from "./support.ts";

test.describe.configure({ mode: "serial" });

const f = createFixture("docs");
const { project, suffix, created } = f;

test.beforeAll(async ({ request }) => f.seed(request));
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

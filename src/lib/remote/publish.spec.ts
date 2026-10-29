import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { entityOf } from "#lib/server/events.ts";
import type { OpDefinition } from "./registry.ts";

const { publishChange } = vi.hoisted(() => ({ publishChange: vi.fn() }));

vi.mock("#lib/server/events.ts", async (importOriginal) => ({
	...(await importOriginal<typeof import("#lib/server/events.ts")>()),
	publishChange,
}));

const { runOp } = await import("./define.ts");
const { getOps } = await import("./index.ts");

function command(name: string, kind: "query" | "command" = "command") {
	const op: OpDefinition = {
		name,
		description: name,
		kind,
		input: z.object({}),
		handler: async () => ({ ok: true }),
	};
	return op;
}

function commands(prefix: string) {
	return [...getOps().keys()].filter((name) => name.startsWith(prefix));
}

describe("publishChange wiring", () => {
	beforeEach(() => {
		publishChange.mockClear();
	});

	it("publishes the entity of the command it just ran", async () => {
		await runOp(command("tasks_update"), {}, "ui");

		expect(publishChange).toHaveBeenCalledWith("tasks", "tasks_update");
	});

	it("does not publish for queries", async () => {
		await runOp(command("tasks_list", "query"), {}, "ui");

		expect(publishChange).not.toHaveBeenCalled();
	});

	it("does not publish for a backup", async () => {
		await runOp(command("backup_create"), {}, "ui");

		expect(publishChange).not.toHaveBeenCalled();
	});

	it("maps every task, project, scope and attachment command", () => {
		const expected = [
			["tasks_", "tasks"],
			["projects_", "projects"],
			["scopes_", "scopes"],
			["attachments_", "tasks"],
		] as const;

		for (const [prefix, entity] of expected) {
			for (const name of commands(prefix)) {
				if (name.startsWith("tasks_comments_")) {
					continue;
				}
				expect(entityOf(name), name).toBe(entity);
			}
		}
	});

	it("publishes a tag change for every tag command", async () => {
		for (const name of commands("tags_")) {
			publishChange.mockClear();
			await runOp(command(name), {}, "ui");
			expect(publishChange, name).toHaveBeenCalledWith("tags", name);
		}
	});

	it("publishes comments as their own entity", async () => {
		for (const name of commands("tasks_comments_")) {
			publishChange.mockClear();
			await runOp(command(name), {}, "ui");
			expect(publishChange, name).toHaveBeenCalledWith("comments", name);
		}
	});
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Comment } from "#lib/types.ts";

const listComments = vi.fn();

interface QueryMock {
	current: { items: Comment[] } | undefined;
	refresh: () => Promise<void>;
}

vi.mock("#lib/remote/comments.remote.ts", () => ({
	listComments: (input: { task_id: string }) => {
		const query: QueryMock = {
			current: undefined,
			refresh: async () => {
				const value = await listComments(input);
				query.current = value;
			},
		};
		return query;
	},
}));

const { createCommentsStore } = await import("./comments.svelte.ts");

function comment(id: string, body: string): Comment {
	return {
		id,
		task_id: "SPA-1",
		body,
		created_at: "2026-10-21T00:00:00.000Z",
		edited_at: null,
		deleted_at: null,
	};
}

describe("comments store", () => {
	beforeEach(() => {
		listComments.mockReset();
	});

	it("keeps the newest list when an older request answers later", async () => {
		const store = createCommentsStore();
		let resolveFirst: (value: { items: Comment[] }) => void = () => {};
		listComments
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						resolveFirst = resolve;
					}),
			)
			.mockImplementationOnce(async () => ({
				items: [comment("c1", "new")],
			}));

		const first = store.load("SPA-1");
		await store.load("SPA-1");
		resolveFirst({ items: [comment("c0", "old")] });
		await first;

		expect(store.items("SPA-1").map((item) => item.body)).toEqual(["new"]);
	});

	it("counts the comments of a task", async () => {
		const store = createCommentsStore();
		listComments.mockResolvedValueOnce({
			items: [comment("c1", "one"), comment("c2", "two")],
		});

		await store.load("SPA-1");

		expect(store.count("SPA-1")).toBe(2);
		expect(store.count("SPA-2")).toBe(0);
	});

	it("applies a sent comment and drops a deleted one", async () => {
		const store = createCommentsStore();
		listComments.mockResolvedValueOnce({ items: [] });
		await store.load("SPA-1");

		store.apply(comment("c1", "hello"));
		expect(store.count("SPA-1")).toBe(1);

		store.remove("SPA-1", "c1");
		expect(store.count("SPA-1")).toBe(0);
	});

	it("reloads the watched task on refresh and ignores an unwatched one", async () => {
		const store = createCommentsStore();
		listComments.mockResolvedValue({ items: [comment("c1", "one")] });

		await store.refresh();
		expect(listComments).not.toHaveBeenCalled();

		store.watch("SPA-1");
		await store.refresh();
		expect(listComments).toHaveBeenCalledTimes(1);
		expect(store.count("SPA-1")).toBe(1);
	});
});

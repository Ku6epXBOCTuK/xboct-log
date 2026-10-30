import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTaskDraft } from "./task-draft.ts";

describe("task draft", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("waits for the delay before saving", () => {
		const save = vi.fn();
		const draft = createTaskDraft({ save, delay: 10 });

		draft.draft("LOG-1", { title: "a" });
		expect(save).not.toHaveBeenCalled();

		vi.advanceTimersByTime(10);

		expect(save).toHaveBeenCalledWith("LOG-1", { title: "a" });
	});

	it("merges patches of the same task into one save", () => {
		const save = vi.fn();
		const draft = createTaskDraft({ save, delay: 10 });

		draft.draft("LOG-1", { title: "a" });
		draft.draft("LOG-1", { description: "b" });
		vi.advanceTimersByTime(10);

		expect(save).toHaveBeenCalledTimes(1);
		expect(save).toHaveBeenCalledWith("LOG-1", {
			title: "a",
			description: "b",
		});
	});

	it("saves the previous task when the draft moves to another one", () => {
		const save = vi.fn();
		const draft = createTaskDraft({ save, delay: 10 });

		draft.draft("LOG-1", { title: "a" });
		draft.draft("LOG-2", { title: "b" });

		expect(save).toHaveBeenCalledWith("LOG-1", { title: "a" });

		vi.advanceTimersByTime(10);

		expect(save).toHaveBeenCalledWith("LOG-2", { title: "b" });
		expect(save).toHaveBeenCalledTimes(2);
	});

	it("keeps the draft when cancelled before the delay", () => {
		const save = vi.fn();
		const draft = createTaskDraft({ save, delay: 10 });

		draft.draft("LOG-1", { title: "a" });
		draft.cancel();
		vi.advanceTimersByTime(50);

		expect(save).not.toHaveBeenCalled();

		draft.flush();
		expect(save).toHaveBeenCalledWith("LOG-1", { title: "a" });
	});

	it("drops the draft once it is flushed", () => {
		const save = vi.fn();
		const draft = createTaskDraft({ save, delay: 10 });

		draft.draft("LOG-1", { title: "a" });
		draft.flush();
		draft.flush();
		vi.advanceTimersByTime(50);

		expect(save).toHaveBeenCalledTimes(1);
	});

	it("releases the draft when another task is shown", () => {
		const save = vi.fn();
		const draft = createTaskDraft({ save, delay: 10 });

		draft.draft("LOG-1", { title: "a" });
		draft.release("LOG-1");
		draft.release("LOG-2");

		expect(save).toHaveBeenCalledWith("LOG-1", { title: "a" });
	});

	it("saves nothing when no patch was buffered", () => {
		const save = vi.fn();
		const draft = createTaskDraft({ save, delay: 10 });

		draft.release("LOG-2");
		draft.flush();

		expect(save).not.toHaveBeenCalled();
	});
});

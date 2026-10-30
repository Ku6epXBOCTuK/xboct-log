import { describe, expect, it, vi } from "vitest";
import {
	addConnection,
	connectionCandidates,
	isLinkCandidate,
	removeConnection,
	type LinkCommands,
} from "./connections.ts";
import type { Task } from "#lib/types.ts";

function task(id: string, extra: Partial<Task> = {}): Task {
	return {
		id,
		project_id: "spa",
		number: Number(id.split("-")[1]),
		title: id,
		description: "",
		status: "open",
		priority: "medium",
		is_epic: false,
		epic_id: null,
		scope_id: null,
		source_file: null,
		estimate: null,
		assignee: null,
		due_at: null,
		tags: [],
		created_at: "2026-01-01T00:00:00.000Z",
		updated_at: "2026-01-01T00:00:00.000Z",
		closed_at: null,
		closed_reason: null,
		blocked_reason: null,
		deleted_at: null,
		blocked_by: [],
		blocks: [],
		...extra,
	};
}

function commands(): LinkCommands {
	return {
		addBlocker: vi.fn(async () => task("SPA-1")),
		removeBlocker: vi.fn(async () => task("SPA-1")),
		addLink: vi.fn(async () => task("SPA-1")),
		removeLink: vi.fn(async () => task("SPA-1")),
	};
}

describe("link candidates", () => {
	it("rejects the task itself, closed tasks and existing links", () => {
		const subject = task("SPA-1", {
			relates_to: ["SPA-2"],
			duplicates: ["SPA-3"],
			duplicated_by: ["SPA-4"],
		});

		expect(isLinkCandidate(task("SPA-1"), subject)).toBe(false);
		expect(isLinkCandidate(task("SPA-9", { status: "done" }), subject)).toBe(
			false,
		);
		expect(isLinkCandidate(task("SPA-2"), subject)).toBe(false);
		expect(isLinkCandidate(task("SPA-3"), subject)).toBe(false);
		expect(isLinkCandidate(task("SPA-4"), subject)).toBe(false);
		expect(isLinkCandidate(task("SPA-5"), subject)).toBe(true);
	});

	it("merges project and search candidates once", () => {
		const subject = task("SPA-1");
		const candidate = task("SPA-2");
		const found = task("SPA-3");

		const result = connectionCandidates(
			[subject, candidate],
			[candidate, found],
			subject,
		);

		expect(result.links.map((item) => item.id)).toEqual(["SPA-2", "SPA-3"]);
		expect(result.blockers.map((item) => item.id)).toEqual(["SPA-2", "SPA-3"]);
	});

	it("returns nothing for a task without open neighbours", () => {
		const subject = task("SPA-1");

		const result = connectionCandidates([subject], [subject], subject);

		expect(result).toEqual({ blockers: [], links: [] });
	});
});

describe("connection commands", () => {
	const subject = task("SPA-1");

	it("adds a blocker through the task that carries the block", () => {
		const api = commands();

		void addConnection(api, subject, "blocked_by", "SPA-2");
		expect(api.addBlocker).toHaveBeenCalledWith("SPA-1", "SPA-2");

		void addConnection(api, subject, "blocks", "SPA-3");
		expect(api.addBlocker).toHaveBeenCalledWith("SPA-3", "SPA-1");
	});

	it("adds a duplicate link on the side that holds the relation", () => {
		const api = commands();

		void addConnection(api, subject, "duplicated_by", "SPA-4");
		expect(api.addLink).toHaveBeenCalledWith("SPA-4", "duplicates", "SPA-1");

		void addConnection(api, subject, "duplicates", "SPA-5");
		expect(api.addLink).toHaveBeenCalledWith("SPA-1", "duplicates", "SPA-5");

		void addConnection(api, subject, "relates_to", "SPA-6");
		expect(api.addLink).toHaveBeenCalledWith("SPA-1", "relates_to", "SPA-6");
	});

	it("removes a blocker through the task that carries the block", () => {
		const api = commands();

		void removeConnection(api, subject, "blocked_by", "SPA-2");
		expect(api.removeBlocker).toHaveBeenCalledWith("SPA-1", "SPA-2");

		void removeConnection(api, subject, "blocks", "SPA-3");
		expect(api.removeBlocker).toHaveBeenCalledWith("SPA-3", "SPA-1");
	});

	it("removes a duplicate link on the side that holds the relation", () => {
		const api = commands();

		void removeConnection(api, subject, "duplicated_by", "SPA-4");
		expect(api.removeLink).toHaveBeenCalledWith("SPA-4", "duplicates", "SPA-1");

		void removeConnection(api, subject, "duplicates", "SPA-5");
		expect(api.removeLink).toHaveBeenCalledWith("SPA-1", "duplicates", "SPA-5");

		void removeConnection(api, subject, "relates_to", "SPA-6");
		expect(api.removeLink).toHaveBeenCalledWith("SPA-1", "relates_to", "SPA-6");
	});
});

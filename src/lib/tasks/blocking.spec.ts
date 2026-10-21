import { describe, expect, it } from "vitest";
import {
	blockedDownstream,
	blockingCandidates,
	openBlockers,
} from "./blocking.ts";
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
		tags: [],
		created_at: "2026-01-01T00:00:00.000Z",
		updated_at: "2026-01-01T00:00:00.000Z",
		closed_at: null,
		closed_reason: null,
		deleted_at: null,
		blocked_by: [],
		blocks: [],
		...extra,
	};
}

describe("blocking helpers", () => {
	it("counts only open blockers", () => {
		const blocker = task("SPA-1");
		const done = task("SPA-2", { status: "done" });
		const subject = task("SPA-3", { blocked_by: ["SPA-1", "SPA-2"] });

		expect(openBlockers([blocker, done, subject], subject)).toEqual(["SPA-1"]);
	});

	it("treats an unknown blocker as open", () => {
		const subject = task("SPA-3", { blocked_by: ["SPA-9"] });

		expect(openBlockers([subject], subject)).toEqual(["SPA-9"]);
	});

	it("collects downstream tasks", () => {
		const first = task("SPA-1", { blocks: ["SPA-2"] });
		const second = task("SPA-2", { blocks: ["SPA-3"] });
		const third = task("SPA-3");

		expect(blockedDownstream([first, second, third], "SPA-1")).toEqual(
			new Set(["SPA-2", "SPA-3"]),
		);
	});

	it("offers candidates without self, links, downstream and closed tasks", () => {
		const subject = task("SPA-9", {
			blocked_by: ["SPA-3"],
			blocks: ["SPA-2"],
		});
		const downstream = task("SPA-2", { blocks: ["SPA-1"] });
		const downstreamEnd = task("SPA-1");
		const linked = task("SPA-3");
		const closed = task("SPA-4", { status: "done" });
		const candidate = task("SPA-5");
		const all = [subject, downstream, downstreamEnd, linked, closed, candidate];

		expect(blockingCandidates(all, subject).map((item) => item.id)).toEqual([
			"SPA-5",
		]);
	});
});

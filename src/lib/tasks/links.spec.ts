import { describe, expect, it } from "vitest";
import { applyLinkJobs, type LinkJob } from "./links.ts";

function job(field: LinkJob["field"], target: string): LinkJob {
	return { field, target, run: async () => {} };
}

describe("apply link jobs", () => {
	it("runs every job and reports the applied ones", async () => {
		const done: string[] = [];
		const jobs = [job("blocked_by", "LOG-1"), job("relates_to", "LOG-2")];

		const failures = await applyLinkJobs(jobs, (applied) =>
			done.push(applied.target),
		);

		expect(done).toEqual(["LOG-1", "LOG-2"]);
		expect(failures).toEqual([]);
	});

	it("keeps going after a link fails", async () => {
		const jobs: LinkJob[] = [
			{ field: "blocked_by", target: "LOG-1", run: async () => {} },
			{
				field: "relates_to",
				target: "LOG-2",
				run: async () => {
					throw new Error("offline");
				},
			},
			{ field: "duplicates", target: "LOG-3", run: async () => {} },
		];

		const failures = await applyLinkJobs(jobs);

		expect(failures).toEqual([
			{ field: "relates_to", target: "LOG-2", message: "offline" },
		]);
	});

	it("reads the message from the transport error body", async () => {
		const jobs: LinkJob[] = [
			{
				field: "blocks",
				target: "LOG-9",
				run: async () => {
					throw { body: { message: "the task is already blocked by it" } };
				},
			},
		];

		const failures = await applyLinkJobs(jobs);

		expect(failures).toEqual([
			{
				field: "blocks",
				target: "LOG-9",
				message: "the task is already blocked by it",
			},
		]);
	});
});

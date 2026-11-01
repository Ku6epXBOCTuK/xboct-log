import { describe, expect, it } from "vitest";
import { getOps } from "./index.js";

describe("activity wiring", () => {
	it("records nothing only for the backup commands", () => {
		const skipped = [...getOps()]
			.filter(([, op]) => op.kind === "command" && op.activity === null)
			.map(([name]) => name)
			.sort();

		expect(skipped).toEqual([
			"backup_create",
			"backups_inspect",
			"backups_restore",
		]);
	});
});

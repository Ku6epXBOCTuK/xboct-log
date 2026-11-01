import { describe, expect, it } from "vitest";
import { attachEach } from "./attachments.ts";

function item(key: string) {
	return { key, file: new File(["data"], `${key}.txt`) };
}

describe("attach each", () => {
	it("attaches every file and reports the keys", async () => {
		const sent: string[] = [];

		const outcome = await attachEach([item("a"), item("b")], async (entry) => {
			sent.push(entry.file.name);
		});

		expect(sent).toEqual(["a.txt", "b.txt"]);
		expect(outcome.attached).toEqual(["a", "b"]);
		expect(outcome.failed).toEqual([]);
	});

	it("keeps going after a file fails", async () => {
		const outcome = await attachEach(
			[item("a"), item("b"), item("c")],
			async (entry) => {
				if (entry.key === "b") throw new Error("offline");
			},
		);

		expect(outcome.attached).toEqual(["a", "c"]);
		expect(outcome.failed).toEqual([{ name: "b.txt", message: "offline" }]);
	});

	it("reads the message from the transport error body", async () => {
		const outcome = await attachEach([item("a")], async () => {
			throw { body: { message: "the file is too large" } };
		});

		expect(outcome.failed).toEqual([
			{ name: "a.txt", message: "the file is too large" },
		]);
	});
});

import type { RequestEvent } from "@sveltejs/kit";
import { describe, expect, it } from "vitest";
import { publishChange } from "#lib/server/events.ts";
import { GET } from "./+server.js";

function event(): RequestEvent {
	const controller = new AbortController();
	return {
		request: new Request("http://localhost/api/events", {
			signal: controller.signal,
		}),
	} as unknown as RequestEvent;
}

async function nextEvent(
	reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<{ event: string; data: unknown }> {
	const decoder = new TextDecoder();
	let buffer = "";
	for (;;) {
		const { done, value } = await reader.read();
		buffer += decoder.decode(value);
		const block = buffer.indexOf("\n\n");
		if (block === -1) {
			if (done) throw new Error("stream ended before an event arrived");
			continue;
		}
		const text = buffer.slice(0, block);
		const name = text
			.split("\n")
			.find((line) => line.startsWith("event: "))
			?.slice("event: ".length);
		const data = text
			.split("\n")
			.find((line) => line.startsWith("data: "))
			?.slice("data: ".length);
		return { event: name ?? "", data: data ? JSON.parse(data) : undefined };
	}
}

describe("/api/events endpoint", () => {
	it("sends sync on connect and change on published events", async () => {
		const response = GET(event());
		expect(response.headers.get("content-type")).toBe("text/event-stream");

		const reader = response.body?.getReader();
		expect(reader).toBeDefined();

		const sync = await nextEvent(reader!);
		expect(sync.event).toBe("sync");
		expect(sync.data).toHaveProperty("seq");

		publishChange("tasks", "tasks_close");

		const change = await nextEvent(reader!);
		expect(change.event).toBe("change");
		expect(change.data).toMatchObject({ entity: "tasks", op: "tasks_close" });

		await reader!.cancel();
	});
});

import { currentSeq, subscribe, type ChangeEvent } from "#lib/server/events.ts";
import type { RequestEvent } from "@sveltejs/kit";

const HEARTBEAT_MS = 15_000;

function encode(event: string, data: unknown): Uint8Array {
	return new TextEncoder().encode(
		`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
	);
}

export function GET({ request }: RequestEvent): Response {
	let cleanup = (): void => {};

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			let closed = false;

			function push(chunk: Uint8Array): void {
				if (closed) {
					return;
				}
				try {
					controller.enqueue(chunk);
				} catch {
					closed = true;
				}
			}

			const send = (event: string, data: unknown) => push(encode(event, data));
			const unsubscribe = subscribe((change: ChangeEvent) =>
				send("change", change),
			);
			const heartbeat = setInterval(
				() => push(new TextEncoder().encode(": ping\n\n")),
				HEARTBEAT_MS,
			);

			cleanup = () => {
				closed = true;
				clearInterval(heartbeat);
				unsubscribe();
			};

			request.signal.addEventListener("abort", () => {
				cleanup();
				try {
					controller.close();
				} catch {
					// NOTE: already closed by cancel(); nothing to do.
				}
			});

			send("sync", { seq: currentSeq() });
		},
		cancel() {
			cleanup();
		},
	});

	return new Response(stream, {
		headers: {
			"content-type": "text/event-stream",
			"cache-control": "no-cache, no-transform",
			connection: "keep-alive",
			"x-accel-buffering": "no",
		},
	});
}

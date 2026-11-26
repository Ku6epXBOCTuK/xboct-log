import createClient from "openapi-fetch";
import { CLIENT_ID } from "#lib/client/id.ts";
import {
	reportReachable,
	reportUnreachable,
} from "#lib/client/reachability.ts";
import { CLIENT_HEADER } from "#lib/types.ts";
import type { paths } from "#lib/api/schema.d.ts";

const TIMEOUT_MS = 8_000;
const RETRY_DELAYS_MS = [300, 900] as const;

export class ApiError extends Error {
	readonly status: number;
	readonly kind: string;

	constructor(status: number, kind: string, message: string) {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.kind = kind;
	}
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryable(error: unknown): boolean {
	return (
		error instanceof TypeError ||
		(error instanceof DOMException && error.name === "TimeoutError")
	);
}

async function timedFetch(request: Request): Promise<Response> {
	for (let attempt = 0; ; attempt++) {
		try {
			const response = await globalThis.fetch(request.clone(), {
				signal: AbortSignal.timeout(TIMEOUT_MS),
			});
			reportReachable();
			return response;
		} catch (error) {
			if (attempt >= RETRY_DELAYS_MS.length || !retryable(error)) {
				reportUnreachable();
				throw error;
			}
			await delay(RETRY_DELAYS_MS[attempt]);
		}
	}
}

export const client = createClient<paths>({
	fetch: timedFetch,
	headers: { [CLIENT_HEADER]: CLIENT_ID },
});

interface Answer {
	data?: unknown;
	error?: unknown;
	response: Response;
}

export function unwrap<T>(answer: Answer): T {
	const { data, error, response } = answer;
	if (error !== undefined) {
		const body = error as { kind?: string; message?: string };
		throw new ApiError(
			response.status,
			body.kind ?? "unknown",
			body.message ?? response.statusText,
		);
	}
	if (data === undefined) {
		throw new ApiError(response.status, "empty", "the server returned no body");
	}
	return data as T;
}

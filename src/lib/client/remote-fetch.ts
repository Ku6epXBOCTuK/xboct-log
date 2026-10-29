// NOTE: SvelteKit's client remote request has no timeout and no retry, so a
// single hung query blocks every later refresh. Wrapping globalThis.fetch is
// the only client-side hook: commands keep one attempt, queries retry.
const REMOTE_URL = /\/remote\/[^/?#]+(?:[?#]|$)/;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_RETRY_DELAYS_MS = [300, 900] as const;

export interface RemoteFetchOptions {
	timeoutMs?: number;
	retryDelaysMs?: readonly number[];
	fetch?: typeof fetch;
}

function urlOf(input: RequestInfo | URL): string {
	if (typeof input === "string") {
		return input;
	}
	return input instanceof URL ? input.href : input.url;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createRemoteFetch(
	options: RemoteFetchOptions = {},
): typeof fetch {
	const base = options.fetch ?? globalThis.fetch.bind(globalThis);
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const retryDelays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;

	return async function remoteFetch(input, init) {
		if (!REMOTE_URL.test(urlOf(input))) {
			return base(input, init);
		}

		const method = (
			init?.method ?? (input instanceof Request ? input.method : "GET")
		).toUpperCase();
		const attempts = method === "GET" ? retryDelays.length + 1 : 1;

		for (let attempt = 0; ; attempt++) {
			const timeout = AbortSignal.timeout(timeoutMs);
			const signal = init?.signal
				? AbortSignal.any([init.signal, timeout])
				: timeout;
			const request =
				input instanceof Request ? new Request(input, { signal }) : input;
			const requestInit: RequestInit | undefined =
				input instanceof Request ? init : { ...init, signal };

			try {
				const response = await base(request, requestInit);
				if (
					attempt + 1 < attempts &&
					RETRYABLE_STATUS.has(response.status) &&
					!init?.signal?.aborted
				) {
					void response.body?.cancel();
					await delay(retryDelays[attempt]);
					continue;
				}
				return response;
			} catch (error) {
				const retryable = timeout.aborted || error instanceof TypeError;
				if (attempt + 1 >= attempts || !retryable || init?.signal?.aborted) {
					throw error;
				}
				await delay(retryDelays[attempt]);
			}
		}
	} as typeof fetch;
}

export function installRemoteFetch(): void {
	globalThis.fetch = createRemoteFetch({ fetch: globalThis.fetch });
}

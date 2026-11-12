const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STORED_NAME =
	/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\.[A-Za-z0-9]+)$/i;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

const DAY_MS = 86_400_000;

export interface NormalizerOptions {
	now?: number;
	runtimeDir?: string;
	identities?: ReadonlyMap<string, string>;
}

function normalizeAttachmentUris(
	value: string,
	normalizeUuid: (uuid: string) => string,
): string {
	if (!value.includes("xboct-log://attachment/")) {
		return value;
	}
	return value.replace(
		/xboct-log:\/\/attachment\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi,
		(_match, uuid: string) => `xboct-log://attachment/${normalizeUuid(uuid)}`,
	);
}

export function createNormalizer(
	options: NormalizerOptions = {},
): <T>(value: T) => T {
	const now = options.now ?? Date.now();
	const runtime = options.runtimeDir?.replaceAll("\\", "/").replace(/\/$/, "");
	const identities = options.identities ?? new Map<string, string>();
	const uuids = new Map<string, string>();

	function normalizeUuid(value: string): string {
		const key = value.toLowerCase();
		const known = identities.get(key);
		if (known !== undefined) {
			return known;
		}
		const existing = uuids.get(key);
		if (existing !== undefined) {
			return existing;
		}
		const placeholder = `<uuid:${uuids.size + 1}>`;
		uuids.set(key, placeholder);
		return placeholder;
	}

	function normalizeString(value: string): string {
		const attachment = normalizeAttachmentUris(value, normalizeUuid);
		if (attachment !== value) {
			return attachment;
		}
		if (UUID.test(value)) {
			return normalizeUuid(value);
		}
		const stored = STORED_NAME.exec(value);
		if (stored !== null) {
			return `${normalizeUuid(stored[1])}${stored[2]}`;
		}
		if (TIMESTAMP.test(value)) {
			const parsed = Date.parse(value);
			if (Number.isFinite(parsed) && Math.abs(parsed - now) <= DAY_MS) {
				return "<now>";
			}
		}
		if (runtime !== undefined) {
			const portable = value.replaceAll("\\", "/");
			if (portable === runtime || portable.startsWith(`${runtime}/`)) {
				return `<runtime>${portable.slice(runtime.length)}`;
			}
		}
		if (value.startsWith("[") || value.startsWith("{")) {
			try {
				return JSON.stringify(walk(JSON.parse(value)));
			} catch {
				return value;
			}
		}
		return value;
	}

	function walk(value: unknown): unknown {
		if (typeof value === "string") {
			return normalizeString(value);
		}
		if (Array.isArray(value)) {
			return value.map(walk);
		}
		if (value !== null && typeof value === "object") {
			return Object.fromEntries(
				Object.entries(value).map(([key, entry]) => [key, walk(entry)]),
			);
		}
		return value;
	}

	return (value) => walk(value) as typeof value;
}

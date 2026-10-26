export const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
export const PROJECT_PREFIX_PATTERN = /^[A-Z0-9]{1,6}$/;
export const PROJECT_ID_MAX_LENGTH = 40;

export function normalizeProjectPrefix(value: string): string {
	return value.trim().toUpperCase();
}

export function slugifyProjectId(name: string): string {
	return name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, PROJECT_ID_MAX_LENGTH)
		.replace(/-+$/g, "");
}

export function projectIdError(id: string): string | null {
	if (id === "") return "Project id is required";
	if (id.length > PROJECT_ID_MAX_LENGTH) {
		return `Project id must be ${PROJECT_ID_MAX_LENGTH} characters or fewer`;
	}
	if (!PROJECT_ID_PATTERN.test(id)) {
		return "Project id may contain latin letters, digits and dashes";
	}
	return null;
}

export function projectPrefixError(prefix: string): string | null {
	if (prefix === "") return "Project prefix is required";
	if (!PROJECT_PREFIX_PATTERN.test(prefix)) {
		return "Project prefix must be 1-6 uppercase letters or digits";
	}
	return null;
}

export const REPO_MAX_LENGTH = 200;
const REPO_HOST_PATTERN = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?$/i;
const REPO_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;

function splitRepo(value: string): { host: string; path: string } | null {
	const trimmed = value.trim();
	if (trimmed === "") return null;
	const scheme = /^[a-z][a-z0-9+.-]*:\/\//i.exec(trimmed);
	let rest = scheme === null ? trimmed : trimmed.slice(scheme[0].length);
	if (scheme === null) {
		const scp = /^[^@/\s]+@([^:/\s]+):(.+)$/.exec(rest);
		if (scp !== null) {
			rest = `${scp[1]}/${scp[2]}`;
		}
	}
	const slash = rest.indexOf("/");
	if (slash === -1) return null;
	const host = rest.slice(0, slash).replace(/^.*@/, "").toLowerCase();
	const path = rest
		.slice(slash + 1)
		.replace(/\/+$/, "")
		.replace(/\.git$/i, "")
		.replace(/\/+$/, "");
	if (host === "" || path === "") return null;
	const segments = path.split("/");
	if (segments.some((segment) => segment === "." || segment === "..")) {
		return null;
	}
	return { host, path };
}

export function normalizeRepo(value: string): string | null {
	const parts = splitRepo(value);
	return parts === null ? null : `${parts.host}/${parts.path}`;
}

export function repoError(value: string): string | null {
	const trimmed = value.trim();
	if (trimmed === "") return null;
	if (trimmed.length > REPO_MAX_LENGTH) {
		return `Repository must be ${REPO_MAX_LENGTH} characters or fewer`;
	}
	const parts = splitRepo(value);
	if (parts === null || !REPO_HOST_PATTERN.test(parts.host)) {
		return "Repository must look like host/owner/name";
	}
	const segments = parts.path.split("/");
	if (
		segments.length < 2 ||
		!segments.every((segment) => REPO_SEGMENT_PATTERN.test(segment))
	) {
		return "Repository must look like host/owner/name";
	}
	return null;
}

export function uniqueProjectId(base: string, taken: Iterable<string>): string {
	const ids = new Set(taken);
	if (base !== "" && !ids.has(base)) return base;
	let counter = 2;
	while (ids.has(`${base}-${counter}`)) counter += 1;
	return `${base}-${counter}`;
}

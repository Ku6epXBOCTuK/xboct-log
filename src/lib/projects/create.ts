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

export function uniqueProjectId(base: string, taken: Iterable<string>): string {
	const ids = new Set(taken);
	if (base !== "" && !ids.has(base)) return base;
	let counter = 2;
	while (ids.has(`${base}-${counter}`)) counter += 1;
	return `${base}-${counter}`;
}

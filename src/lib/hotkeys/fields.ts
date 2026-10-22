export interface FieldLike {
	tagName: string;
	type?: string;
}

const TEXT_INPUT_TYPES = new Set([
	"text",
	"search",
	"email",
	"url",
	"number",
	"date",
	"datetime-local",
	"time",
	"password",
	"tel",
]);

export function isTextInput(field: FieldLike): boolean {
	if (field.tagName.toUpperCase() !== "INPUT") return false;
	const type = (field.type ?? "text").toLowerCase();
	return TEXT_INPUT_TYPES.has(type);
}

export function isTextarea(field: FieldLike): boolean {
	return field.tagName.toUpperCase() === "TEXTAREA";
}

export function nextField(
	fields: FieldLike[],
	target: FieldLike,
): FieldLike | null {
	const index = fields.indexOf(target);
	if (index < 0) return null;
	for (let i = index + 1; i < fields.length; i += 1) {
		const candidate = fields[i];
		if (isTextInput(candidate) || isTextarea(candidate)) return candidate;
	}
	return null;
}

export function focusNextField(
	event: KeyboardEvent,
	options: { exclude?: string } = {},
): boolean {
	if (event.key !== "Enter" || event.shiftKey) return false;
	const target = event.target;
	if (!(target instanceof HTMLElement)) return false;
	if (!isTextInput(target)) return false;

	const root = event.currentTarget;
	if (!(root instanceof HTMLElement)) return false;

	const fields = Array.from(
		root.querySelectorAll<HTMLElement>("input, textarea"),
	).filter(
		(element) =>
			(options.exclude === undefined ||
				element.closest(options.exclude) === null) &&
			(element.offsetParent !== null || element.getClientRects().length > 0),
	);

	const next = nextField(fields, target);
	if (next === null) return false;

	event.preventDefault();
	(next as HTMLElement).focus();
	return true;
}

export function fieldNavigation(
	node: HTMLElement,
	options: { exclude?: string } = {},
) {
	const handler = (event: KeyboardEvent) => {
		focusNextField(event, options);
	};
	node.addEventListener("keydown", handler);
	return {
		destroy() {
			node.removeEventListener("keydown", handler);
		},
	};
}

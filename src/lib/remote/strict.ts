import { z } from "zod";

function editDistance(a: string, b: string): number {
	const rows = Array.from({ length: a.length + 1 }, (_, row) =>
		Array.from({ length: b.length + 1 }, (_, column) =>
			row === 0 ? column : column === 0 ? row : 0,
		),
	);
	for (let row = 1; row <= a.length; row += 1) {
		for (let column = 1; column <= b.length; column += 1) {
			const cost = a[row - 1] === b[column - 1] ? 0 : 1;
			rows[row][column] = Math.min(
				rows[row - 1][column] + 1,
				rows[row][column - 1] + 1,
				rows[row - 1][column - 1] + cost,
			);
		}
	}
	return rows[a.length][b.length];
}

function suggestion(key: string, allowed: string[]): string | null {
	const suffixed = allowed.filter((name) => name.endsWith(`_${key}`));
	if (suffixed.length === 1) {
		return suffixed[0];
	}
	const nearest = allowed
		.map((name) => ({ name, distance: editDistance(key, name) }))
		.sort((left, right) => left.distance - right.distance)[0];
	return nearest && nearest.distance <= 2 ? nearest.name : null;
}

export function strictObject<T extends z.ZodRawShape>(shape: T) {
	const allowed = Object.keys(shape);
	return z.strictObject(shape, {
		error: (issue) => {
			if (issue.code !== "unrecognized_keys") {
				return undefined;
			}
			const hints = issue.keys
				.map((key) => {
					const name = suggestion(key, allowed);
					return name === null ? null : `${key} -> ${name}`;
				})
				.filter((hint) => hint !== null);
			const hint =
				hints.length === 0 ? "" : ` Did you mean: ${hints.join(", ")}?`;
			return `Unknown parameter(s): ${issue.keys.join(", ")}.${hint} Allowed parameters: ${allowed.join(", ")}`;
		},
	});
}

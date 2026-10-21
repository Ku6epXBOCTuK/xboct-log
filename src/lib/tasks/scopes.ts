export interface ScopeChoice {
	key: string;
	label: string;
}

export function scopeChoices(
	scopes: { id: number; name: string }[],
): ScopeChoice[] {
	return [
		{ key: "", label: "not selected" },
		...scopes.map((scope) => ({ key: String(scope.id), label: scope.name })),
	];
}

export function scopeIdOf(choice: ScopeChoice): number | null {
	if (choice.key === "") return null;
	return Number(choice.key);
}

export function scopeNameError(name: string): string | null {
	return name.trim() === "" ? "Enter a scope name" : null;
}

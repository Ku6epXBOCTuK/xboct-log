import type { Task } from "#lib/types.ts";

export type SearchTerm =
	| { kind: "number"; number: number }
	| { kind: "id"; id: string }
	| { kind: "text"; text: string };

const DIGITS = /^\d+$/;
const TASK_ID = /^[a-z][a-z0-9]*-\d+$/i;

function tokenize(input: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let quoted = false;

	for (const char of input) {
		if (char === '"') {
			quoted = !quoted;
			continue;
		}
		if (!quoted && /\s/.test(char)) {
			if (current !== "") tokens.push(current);
			current = "";
			continue;
		}
		current += char;
	}

	if (current !== "") tokens.push(current);

	return tokens;
}

function parseTerm(token: string): SearchTerm | null {
	const exact = token.startsWith("=");
	const value = (exact ? token.slice(1) : token).trim();

	if (value === "") return null;

	if (exact) {
		if (DIGITS.test(value)) return { kind: "number", number: Number(value) };
		if (TASK_ID.test(value)) return { kind: "id", id: value.toUpperCase() };
	}

	return { kind: "text", text: value.toLowerCase() };
}

export function parseSearchQuery(input: string): SearchTerm[] {
	return tokenize(input)
		.map(parseTerm)
		.filter((term): term is SearchTerm => term !== null);
}

export function isExactTerm(term: SearchTerm): boolean {
	return term.kind === "number" || term.kind === "id";
}

function matchesTerm(task: Task, term: SearchTerm): boolean {
	switch (term.kind) {
		case "number":
			return task.number === term.number;
		case "id":
			return task.id.toUpperCase() === term.id;
		case "text":
			return (
				task.id.toLowerCase().includes(term.text) ||
				task.title.toLowerCase().includes(term.text) ||
				task.description.toLowerCase().includes(term.text) ||
				(task.epic_id !== null &&
					task.epic_id.toLowerCase().includes(term.text))
			);
	}
}

export function matchesSearch(task: Task, terms: SearchTerm[]): boolean {
	if (terms.length === 0) return true;
	return terms.some((term) => matchesTerm(task, term));
}

export function exactFirst(tasks: Task[], terms: SearchTerm[]): Task[] {
	const exact = terms.filter(isExactTerm);
	if (exact.length === 0) return tasks;

	const hits: Task[] = [];
	const rest: Task[] = [];

	for (const task of tasks) {
		if (matchesSearch(task, exact)) hits.push(task);
		else rest.push(task);
	}

	return [...hits, ...rest];
}

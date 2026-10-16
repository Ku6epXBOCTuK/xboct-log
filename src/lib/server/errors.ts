import { err, ok, type Result } from "neverthrow";

export type ErrorKind = "validation" | "not_found" | "conflict" | "unexpected";

const STATUS_BY_KIND: Record<ErrorKind, number> = {
	validation: 400,
	not_found: 404,
	conflict: 409,
	unexpected: 500,
};

export class BacklogError extends Error {
	readonly kind: ErrorKind;
	readonly status: number;

	constructor(kind: ErrorKind, message: string) {
		super(message);
		this.name = "BacklogError";
		this.kind = kind;
		this.status = STATUS_BY_KIND[kind];
	}
}

export const invalid = (message: string) =>
	new BacklogError("validation", message);
export const notFound = (message: string) =>
	new BacklogError("not_found", message);
export const conflict = (message: string) =>
	new BacklogError("conflict", message);
export const unexpected = (error: unknown) =>
	new BacklogError(
		"unexpected",
		error instanceof Error ? error.message : String(error),
	);

export function guard<T>(run: () => T): Result<T, BacklogError> {
	try {
		return ok(run());
	} catch (error) {
		return err(unexpected(error));
	}
}

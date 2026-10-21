import { err, ok, type Result } from "neverthrow";

export type ErrorKind = "validation" | "not_found" | "conflict" | "unexpected";

export type ErrorStatus = 400 | 404 | 409 | 500;

const STATUS_BY_KIND: Record<ErrorKind, ErrorStatus> = {
	validation: 400,
	not_found: 404,
	conflict: 409,
	unexpected: 500,
};

export class AppError extends Error {
	readonly kind: ErrorKind;
	readonly status: ErrorStatus;

	constructor(kind: ErrorKind, message: string) {
		super(message);
		this.name = "AppError";
		this.kind = kind;
		this.status = STATUS_BY_KIND[kind];
	}
}

export const invalid = (message: string) => new AppError("validation", message);
export const notFound = (message: string) => new AppError("not_found", message);
export const conflict = (message: string) => new AppError("conflict", message);
export const unexpected = (error: unknown) =>
	new AppError(
		"unexpected",
		error instanceof Error ? error.message : String(error),
	);

export function kindForStatus(status: number): ErrorKind {
	const found = Object.entries(STATUS_BY_KIND).find(
		([, value]) => value === status,
	);
	return (found?.[0] as ErrorKind | undefined) ?? "unexpected";
}

export function guard<T>(run: () => T): Result<T, AppError> {
	try {
		return ok(run());
	} catch (error) {
		return err(unexpected(error));
	}
}

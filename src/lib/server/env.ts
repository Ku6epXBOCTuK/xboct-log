// NOTE: the runtime environment wins over the values baked into the generated
// env module: a svelte-kit sync during the tests rewrites that module, and a
// running dev server must not follow it to another database or backup folder.
export function envString(
	name: string,
	baked: string | undefined,
): string | undefined {
	const runtime = process.env[name];
	if (runtime === undefined || runtime === "") return baked;
	return runtime;
}

export function envNumber(name: string, baked: number): number {
	const runtime = process.env[name];
	if (runtime === undefined || runtime === "") return baked;
	const parsed = Number(runtime);
	return Number.isFinite(parsed) ? parsed : baked;
}

export function envFlag(name: string, baked: boolean): boolean {
	const runtime = process.env[name];
	if (runtime === undefined || runtime === "") return baked;
	return runtime !== "0" && runtime.toLowerCase() !== "false";
}

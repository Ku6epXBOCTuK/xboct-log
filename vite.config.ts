import { execSync } from "node:child_process";
import { join } from "node:path";
import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import Icons from "unplugin-icons/vite";
import { defineConfig } from "vitest/config";

function buildVersion(): string {
	try {
		return execSync("git rev-parse HEAD", {
			stdio: ["ignore", "pipe", "ignore"],
		})
			.toString()
			.trim();
	} catch {
		// NOTE: version.name only has to differ between builds, so a timestamp is
		// enough when the build runs outside a git checkout.
		return Date.now().toString();
	}
}

export default defineConfig(({ mode }) => {
	if (mode === "test") {
		process.env.XBOCT_LOG_DB ??= ":memory:";
		// NOTE: the tests must see the migrations of the working copy, not the
		// deployed ones in the production directory.
		process.env.XBOCT_LOG_MIGRATIONS ??= join(process.cwd(), "migrations");
		// NOTE: the default backup directory points at the production copies,
		// so the tests would write their snapshots there.
		process.env.XBOCT_LOG_BACKUP_DIR ??= join(
			process.cwd(),
			".dev",
			"test-backups",
		);
	}

	return {
		plugins: [
			sveltekit({
				compilerOptions: {
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
					experimental: { async: true },
				},
				adapter: adapter(),
				version: { name: buildVersion(), pollInterval: 60_000 },
				experimental: { remoteFunctions: true },
			}),
			Icons({ compiler: "svelte" }),
		],
		test: {
			expect: { requireAssertions: true },
			projects: [
				{
					extends: "./vite.config.ts",
					test: {
						name: "server",
						environment: "node",
						include: ["src/**/*.{test,spec}.{js,ts}"],
						exclude: ["src/**/*.svelte.{test,spec}.{js,ts}"],
					},
				},
			],
		},
	};
});

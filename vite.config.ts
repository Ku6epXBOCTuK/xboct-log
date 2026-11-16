import { execSync } from "node:child_process";
import { join } from "node:path";
import adapterStatic from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import Icons from "unplugin-icons/vite";
import { defineConfig } from "vitest/config";

// NOTE: svelte-check loads this config in development mode too, so the target
// cannot throw when XBOCT_LOG_DEV_PORT is unset; the proxy only matters under
// pnpm dev, which sets the port of the server it starts.
const RUST_DEV_SERVER = `http://127.0.0.1:${process.env.XBOCT_LOG_DEV_PORT ?? "45883"}`;

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

export default defineConfig(() => {
	return {
		plugins: [
			sveltekit({
				compilerOptions: {
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
					experimental: { async: true },
				},
				adapter: adapterStatic({ fallback: "index.html" }),
				version: { name: buildVersion(), pollInterval: 60_000 },
			}),
			Icons({ compiler: "svelte" }),
		],
		resolve: {
			// NOTE: the ui kit is a pnpm link outside the project; without this the
			// kit would pull its own copy of svelte and break runes at runtime.
			dedupe: ["svelte"],
		},
		server: {
			proxy: {
				"/api": { target: RUST_DEV_SERVER, changeOrigin: true },
				"/media": { target: RUST_DEV_SERVER, changeOrigin: true },
				"/deleted/media": { target: RUST_DEV_SERVER, changeOrigin: true },
				"/mcp": { target: RUST_DEV_SERVER, changeOrigin: true },
			},
			fs: {
				allow: [".", join(process.cwd(), "..", "..", "ui-kit")],
			},
		},
		test: {
			// NOTE: the shuffled order catches tests that only pass because a
			// previous one left rows, files or env behind; the seed makes a
			// failing run reproducible.
			sequence: { shuffle: true, seed: 1234 },
			expect: { requireAssertions: true },
			projects: [
				{
					extends: "./vite.config.ts",
					test: {
						name: "server",
						environment: "node",
						testTimeout: 15_000,
						include: ["src/**/*.{test,spec}.{js,ts}"],
						exclude: ["src/**/*.svelte.{test,spec}.{js,ts}"],
					},
				},
			],
		},
	};
});

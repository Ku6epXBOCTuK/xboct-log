import { existsSync } from "node:fs";
import http from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const envFile = join(import.meta.dirname, ".env");
if (existsSync(envFile)) {
	process.loadEnvFile(envFile);
}

process.env.PORT ??= "45881";
process.env.HOST ??= "0.0.0.0";
process.env.PROTOCOL_HEADER ??= "x-forwarded-proto";
process.env.XBOCT_LOG_MIGRATIONS ??= join(import.meta.dirname, "migrations");

const dbPath = process.env.XBOCT_LOG_DB;
if (dbPath === undefined || dbPath === "") {
	console.error("XBOCT_LOG_DB is not set.");
	console.error(`Put XBOCT_LOG_DB=<path to the database> in ${envFile}.`);
	process.exit(1);
}

const port = Number(process.env.PORT);
const host = process.env.HOST;

const { handler } = await import(
	pathToFileURL(join(import.meta.dirname, "build", "handler.js")).href
);

// NOTE: adapter-node assumes `https` when PROTOCOL_HEADER is unset, so on a
// plain-http deployment SvelteKit rejects every non-GET request as cross-site
// ("Cross-site remote requests are forbidden"). Declaring the header fixes it.
http
	.createServer((req, res) => {
		req.headers["x-forwarded-proto"] ??= "http";
		handler(req, res, () => {
			res.statusCode = 404;
			res.end();
		});
	})
	.listen(port, host, () => {
		console.log(`database: ${dbPath}`);
		console.log(`Listening on http://${host}:${port}`);
	});

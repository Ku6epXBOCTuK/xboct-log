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
		console.log(`Listening on http://${host}:${port}`);
	});

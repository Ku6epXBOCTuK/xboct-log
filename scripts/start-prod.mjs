import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

process.env.PORT ??= "45881";
process.env.HOST ??= "0.0.0.0";
process.env.XBOCT_LOG_DB ??= join(homedir(), ".xboct-log", "xboct-log.db");

const entry = join(import.meta.dirname, "build", "index.js");
await import(pathToFileURL(entry).href);

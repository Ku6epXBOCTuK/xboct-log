# Agents

This repository is developed next to live instances of the app. Their data is
not part of the checkout, and this file is the only place in the repository that
describes the policy around them.

## Instances

An instance is a port plus a data folder; the server refuses to start without
both. The development instance is the only one an agent may run:

- port `127.0.0.1:45883`
- data folder `.dev` inside this repository
- started with `pnpm dev`, stopped with Ctrl+C

Production instances exist outside this repository. Do not look for them.

## Never

- Do not read, copy, query, back up, restore or delete a production database,
  media folder, log, backup or `instance.json`.
- Do not start, stop, restart or deploy a production service.
- Do not search the machine for production data folders, production settings or
  a document that describes them. Such a document is kept outside the
  repository on purpose.
- Do not put a production port, path, service name or database snapshot into the
  repository, a test fixture or a default value.
- The deploy scripts read a per-instance `.env` from `XBOCT_LOG_INSTANCE_DIR`.
  Do not read, list or search for those files; they belong to the owner.

## Production access

The only supported way to reach production is the `XBOCT-log` MCP server, which
exposes the tasks, projects, scopes, tags, comments, attachments and backups as
tools. Use those tools instead of connecting to the database or the HTTP API.

If a task needs something the MCP tools do not expose, stop and ask the owner.

# Agents

This repository is developed next to live instances of the app. Live data is not
part of the checkout, and this file is the only place in the repository that
describes the policy around them. Local copies provided by the owner are part of
the checkout and are governed by "Local copies" below.

## Instances

An instance is a port plus a data folder; the server refuses to start without
both. The development instance is the only one an agent may run:

- port `127.0.0.1:45883`
- data folder `.dev` inside this repository
- started with `pnpm dev`, stopped with Ctrl+C

Production instances exist outside this repository. Do not look for them.

## Never

- Do not read, copy, query, back up, restore or delete data of a live production
  instance: its database, media folder, logs, backups or `instance.json`. Local
  copies are covered below.
- Do not start, stop, restart or deploy a production service.
- Do not search the machine for production data folders, production settings or
  a document that describes them. Such a document is kept outside the repository
  on purpose.
- Do not put a production port, path or service name into the repository, a test
  fixture or a default value.
- The deploy scripts read a per-instance `.env` from `XBOCT_LOG_INSTANCE_DIR`.
  Do not read, list or search for those files; they belong to the owner.

## Local copies

A copy of production data placed in the repository by the owner is local data,
not a production instance. It may be read, copied, queried, backed up, restored
locally, used as a seed or fixture, modified and deleted without asking again.
The live instance stays untouched.

Keep one pristine copy in the repository and make a second working copy for any
operation that changes data: e2e runs, migration rehearsals, incident analysis.
Restore the pristine copy by copying it again; do not regenerate it from the
live instance.

If a fresh copy is needed, ask the owner to provide one. When an incident
analysis needs fresh data, asking is required. Never look for it on the disk
yourself.

## Production access

The only supported way to reach the live production instance is the `XBOCT-log`
MCP server, which exposes the tasks, projects, scopes, tags, comments,
attachments and backups as tools. Use those tools instead of connecting to the
database or the HTTP API. MCP is not needed for work on local copies; read them
directly.

If a task needs live data the MCP tools do not expose, stop and ask the owner.
Do not search the machine for it.

# xboct-log

A local-first task backlog. Projects and tasks on top of a single SQLite file.
Built with SvelteKit and Svelte 5.

## Features

- **Tasks** with a `PREFIX-NUMBER` id, title, description, status, priority,
  tags, epics, and closed reasons.
- **Projects** with an id, name, and task prefix. Rename, archive, and restore
  them from the sidebar.
- **Scopes** — optional per-project grouping that turns on once a project has at
  least one scope.
- **List view** with search and status, priority, tag, epic, and scope filters.
- **Detail panel** for editing a task without leaving the list.
- **Light and dark** themes.

## Requirements

- Node.js 22.5 or newer, for the built-in `node:sqlite` module.
- pnpm.

## Getting started

```sh
pnpm install
pnpm dev
```

`pnpm dev` runs on an isolated clone so it never touches the real database: it
uses `~/.xboct-log/dev.db`, writes backups to `~/.xboct-log/dev-backups`, and
leaves `~/.xboct-log/xboct-log.db` (the production database) alone.

Refresh the clone from the live production database at any time:

```sh
pnpm dev:clone
```

Use `pnpm dev:vite` for a raw Vite run without the isolation wrapper.

Point the app at a different database with `XBOCT_LOG_DB`:

```sh
XBOCT_LOG_DB=./tasks.db pnpm dev:vite
```

## Backups

The production server copies the database into `~/.xboct-log/backups`:

- `daily/xboct-log-YYYY-MM-DD.db` — once a day at 03:00.
- `weekly/xboct-log-YYYY-Www.db` — on Sundays at 03:00.

Old copies are pruned automatically. If the server was off at the scheduled
time, a catch-up copy runs on the next start.

Development uses a separate directory and turns backups off, so it never
overwrites a production copy.

| Variable                       | Default                | Meaning                        |
| ------------------------------ | ---------------------- | ------------------------------ |
| `XBOCT_LOG_BACKUP_DIR`         | `~/.xboct-log/backups` | Where copies are written       |
| `XBOCT_LOG_BACKUP_HOUR`        | `3`                    | Hour of the daily run          |
| `XBOCT_LOG_BACKUP_MINUTE`      | `0`                    | Minute of the daily run        |
| `XBOCT_LOG_BACKUP_WEEKDAY`     | `0`                    | Weekly run day (`0` is Sunday) |
| `XBOCT_LOG_BACKUP_DAILY_KEEP`  | `7`                    | Daily copies to keep           |
| `XBOCT_LOG_BACKUP_WEEKLY_KEEP` | `4`                    | Weekly copies to keep          |
| `XBOCT_LOG_BACKUP_DISABLED`    | off                    | Set to `1` to turn backups off |

## Scripts

| Command          | Description                                 |
| ---------------- | ------------------------------------------- |
| `pnpm dev`       | Dev server on an isolated clone of the DB   |
| `pnpm dev:clone` | Copy the prod DB to `~/.xboct-log/dev.db`   |
| `pnpm dev:vite`  | Raw Vite dev server, no isolation           |
| `pnpm build`     | Build for production (Node adapter)         |
| `pnpm preview`   | Preview the production build                |
| `pnpm deploy`    | Build and deploy to the `xboct-log` service |
| `pnpm build:ext` | Compile and package the VS Code extension   |
| `pnpm check`     | Type-check with `svelte-check`              |
| `pnpm lint`      | Prettier check and ESLint                   |
| `pnpm format`    | Format with Prettier                        |
| `pnpm test`      | Run unit tests with Vitest                  |
| `pnpm migrate`   | Apply pending database migrations           |

The `migrate:*` variants (`status`, `rollback`, `baseline`, `unlock`) are in
`package.json`.

## MCP

Every operation is exposed as an MCP tool over Streamable HTTP at `/mcp`. Point
an MCP client at `http://127.0.0.1:45881/mcp`. There is no authentication; the
deployment is assumed to sit behind a network boundary.

## VS Code extension

`vscode-extension/` is a thin client that opens the board in an editor tab.
Build it with `pnpm build:ext`, then install the generated `.vsix`. See
`vscode-extension/README.md`.

## Notes

Architecture map, non-obvious invariants, and deployment details are in
[`docs/notes.md`](./docs/notes.md).

## License

[MIT](./LICENSE)

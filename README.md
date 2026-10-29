# xboct-log

A local-first task backlog. Projects and tasks on top of a single SQLite file.
Built with SvelteKit and Svelte 5.

## Features

- **Tasks** with a `PREFIX-NUMBER` id, title, description, status, priority,
  estimate, assignee, due date, tags, epics, blockers, and closed reasons.
- **Projects** with an id, name, and task prefix, plus an optional repository in
  `host/owner/name` form that the CLI matches against the git origin. Rename,
  archive, and restore them from the sidebar.
- **Scopes** — optional per-project grouping that turns on once a project has at
  least one scope.
- **Tasks view** with search and status, priority, tag, epic, scope, blocker,
  and project filters.
- **Kanban** board grouped by status.
- **Task detail** with comments, revisions, and attachments, without leaving the
  list.
- **Activity** log, with the MCP client that made each change, and **Deleted**
  tasks with restore.
- **Light and dark** themes.

## Install

Three ways, pick one:

- **Windows installer** — `xboct-log-<version>-win-x64-setup.exe` from
  [releases](https://github.com/Ku6epXBOCTuK/xboct-log/releases). Installs for
  the current user, no admin rights, no Node.js needed, adds a Start Menu
  shortcut. Data lives in `%LOCALAPPDATA%\Xboct Log`.
- **Windows portable zip** — unpack anywhere, double-click `xboct-log.cmd` (data
  in `%LOCALAPPDATA%\Xboct Log`) or `xboct-log-portable.cmd` (data in the `data`
  folder next to the launcher). Node.js is bundled.
- **npm** — for machines that already have Node.js 26:

  ```sh
  npm install -g xboct-log
  xboct-log
  ```

The launcher opens the board in the browser and keeps the database, media, and
backups in one data folder. Port `45881` is the default; if it is taken, the
next free one is used. Flags: `--data <dir>`, `--port <port>`, `--host <host>`,
`--no-open`, `--portable`.

## Requirements

- To run a release build: nothing but the download.
- To run from source: Node.js 26 or newer (for the built-in `node:sqlite`
  module) and pnpm.

## Getting started

```sh
pnpm install
pnpm dev
```

`pnpm dev` runs against an isolated database: it uses `./.dev/dev.db` (override
with `XBOCT_LOG_DEV_DB`), writes backups to `./.dev/backups`, and turns the
scheduled backups off. The `.dev` directory is gitignored.

Seed the dev database from a snapshot when you need fresh data:

```sh
pnpm dev:seed
```

The script copies the newest `*.db` file from `./.dev/seed/` into
`./.dev/dev.db`. Drop a snapshot into that folder yourself — nothing in the
repository fetches it from the production host.

## Configuration

Paths are runtime values: nothing is baked into the build, and a checkout needs
no `.env`. `pnpm dev` sets everything itself (`.dev/dev.db`, `.dev/backups`),
`pnpm build` works without any variables, and the launcher of an installed copy
fills in the data folder.

The server variables are declared in `src/env.ts`; `.env.example` lists them.
`XBOCT_LOG_DB`, `XBOCT_LOG_MIGRATIONS`, `XBOCT_LOG_BACKUP_DIR`, and
`XBOCT_LOG_MEDIA_DIR` have no defaults, so the server refuses to start without
them instead of silently opening some other database. Start it through
`bin/xboct-log.mjs` (or `xboct-log`) and it resolves them from the data folder:

| Platform | Default data folder                       |
| -------- | ----------------------------------------- |
| Windows  | `%LOCALAPPDATA%\Xboct Log`                |
| macOS    | `~/Library/Application Support/Xboct Log` |
| Linux    | `$XDG_DATA_HOME/xboct-log`                |

Override it with `--data <dir>` or `XBOCT_LOG_DATA`. `--portable` keeps the data
next to the application.

The bare `node build/index.js` entry point still works if you set the variables
yourself; it is what the deployment service uses.

`migrate:*` scripts target the dev database (`XBOCT_LOG_DEV_DB`, default
`./.dev/dev.db`). Production migrations run inside the server on startup.

`pnpm dev:vite` is the raw Vite run with no isolation, so point it at a database
yourself:

```sh
XBOCT_LOG_DB=./tasks.db XBOCT_LOG_MIGRATIONS=./migrations pnpm dev:vite
```

## Backups

The server copies the database into the backup directory
(`XBOCT_LOG_BACKUP_DIR`):

- `auto/xboct-log-YYYY-MM-DD-HHMMSS.db` — a snapshot taken before the first MCP
  write of every configured interval (30 minutes by default), so a bad agent
  session can be rolled back.
- `daily/xboct-log-YYYY-MM-DD.db` — once a day at the configured time (03:00 by
  default).
- `weekly/xboct-log-YYYY-Www.db` — on the configured weekday (Sunday by
  default), at the same time.
- `manual/xboct-log-YYYY-MM-DD-HHMMSS.db` — written by the `backup_create` tool.

Old copies are pruned automatically. If the server was off at the scheduled
time, a catch-up copy runs on the next start.

Development uses a separate directory and turns backups off, so it never
overwrites a production copy.

| Variable                             | Default | Meaning                        |
| ------------------------------------ | ------- | ------------------------------ |
| `XBOCT_LOG_BACKUP_DIR`               | —       | Where copies are written       |
| `XBOCT_LOG_BACKUP_HOUR`              | `3`     | Hour of the daily run          |
| `XBOCT_LOG_BACKUP_MINUTE`            | `0`     | Minute of the daily run        |
| `XBOCT_LOG_BACKUP_WEEKDAY`           | `0`     | Weekly run day (`0` is Sunday) |
| `XBOCT_LOG_BACKUP_DAILY_KEEP`        | `7`     | Daily copies to keep           |
| `XBOCT_LOG_BACKUP_WEEKLY_KEEP`       | `4`     | Weekly copies to keep          |
| `XBOCT_LOG_BACKUP_AUTO_KEEP`         | `48`    | Auto snapshots to keep         |
| `XBOCT_LOG_BACKUP_AUTO_INTERVAL_MIN` | `30`    | Minutes between auto snapshots |
| `XBOCT_LOG_BACKUP_DISABLED`          | off     | Set to `1` to turn backups off |

### Restoring

Restoring replaces the live database file, so the server has to be stopped
first. The restore is a CLI script rather than an app feature: it has to work
when the application itself is broken.

In development, the script in this repository works on the dev database:

```sh
pnpm restore list                        # every snapshot, newest first
pnpm restore restore <path-to-snapshot>
```

On the production host the same script is deployed next to the application
folder and reads its paths from the `.env` file placed there, so it is run as a
plain Node script with the service stopped:

```sh
node <app-dir>\restore.mjs list
node <app-dir>\restore.mjs restore <path-to-snapshot>
```

The script refuses to run while the server still listens on the port, checks the
snapshot with `PRAGMA integrity_check`, saves the current database into the
`manual` folder before replacing it, writes the new file atomically, and removes
the stale `-wal`/`-shm` files. The database path comes from `--db`, then
`XBOCT_LOG_DB`, then the `.env` next to the script.

The same list is available over MCP through the `backup_list` tool. The tool
cannot restore anything: it only reports which snapshots exist.

## Scripts

| Command            | Description                                        |
| ------------------ | -------------------------------------------------- |
| `pnpm dev`         | Dev server on an isolated database                 |
| `pnpm dev:seed`    | Seed `./.dev/dev.db` from the newest snapshot      |
| `pnpm dev:vite`    | Raw Vite dev server, no isolation                  |
| `pnpm build`       | Build for production (Node adapter)                |
| `pnpm start`       | Run the built app through the launcher             |
| `pnpm package:win` | Build the Windows zip (add `-Installer` for setup) |
| `pnpm preview`     | Preview the production build                       |
| `pnpm run deploy`  | Build and deploy to the `xboct-log` service        |
| `pnpm build:ext`   | Compile and package the VS Code extension          |
| `pnpm check`       | Type-check with `svelte-check`                     |
| `pnpm lint`        | Prettier check and ESLint                          |
| `pnpm format`      | Format with Prettier                               |
| `pnpm test`        | Run unit tests with Vitest                         |
| `pnpm migrate`     | Apply pending database migrations                  |
| `pnpm restore`     | List snapshots or restore one (`list`, `restore`)  |

The `migrate:*` variants (`status`, `rollback`, `baseline`, `unlock`) are in
`package.json`.

## MCP

Every operation is exposed as an MCP tool over Streamable HTTP at `/mcp`. Point
an MCP client at `http://127.0.0.1:45881/mcp`. There is no authentication; the
deployment is assumed to sit behind a network boundary.

Before the first write of every 30-minute window the server snapshots the
database, so a botched agent session can be rolled back to the state before it
started.

## VS Code extension

`vscode-extension/` is a client that opens the board in an editor tab and starts
the local server when it is not running. Build it with `pnpm build:ext`, then
install the generated `.vsix`. Settings: `xboctLog.autoStart`,
`xboctLog.serverPath`, `xboctLog.dataDir`, `xboctLog.serverUrl`. See
`vscode-extension/README.md`.

## Notes

Architecture map, non-obvious invariants, and deployment details are in
[`docs/notes.md`](./docs/notes.md).

## License

[MIT](./LICENSE)

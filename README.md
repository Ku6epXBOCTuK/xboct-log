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
  the current user, no admin rights, adds a Start Menu shortcut. The shortcut
  starts the server with `--port 45881` and the data folder `%LOCALAPPDATA%\Xboct Log`.
- **Windows portable zip** — unpack anywhere, double-click
  `xboct-log-portable.cmd`; the data stays in the `data` folder next to the
  launcher.
- **npm** — for machines that already have Node.js 26:

  ```sh
  npm install -g xboct-log
  xboct-log --port 45881 --data <dir>
  ```

The launcher opens the board in the browser and keeps the database, media, and
backups in one data folder. The port and the folder have no defaults: an
instance is the pair, and the launcher refuses to start without both.
`--port 0` picks any free port, `--portable` keeps the data next to the
executable, and `XBOCT_LOG_PORT` / `XBOCT_LOG_DATA` work as well. A port that
answers with another data folder counts as taken, and the error names both
folders. Flags: `--data <dir>`, `--port <port>`, `--host <host>`, `--no-open`,
`--portable`.

## Requirements

- To run a release build: nothing but the download.
- To run from source: Node.js 26 or newer (for the built-in `node:sqlite`
  module) and pnpm.

## Getting started

```sh
pnpm install
pnpm dev
```

`pnpm dev` starts the Rust server on `127.0.0.1:45883` with `./.dev` as the
data folder (database `./.dev/xboct-log.db`, media and backups next to it),
turns the scheduled backups off, and proxies `/api`, `/media` and `/mcp` from
Vite on `127.0.0.1:5173`. The `.dev` directory is gitignored.

`XBOCT_LOG_DEV_PORT` moves the server to another port. `XBOCT_LOG_DEV_DATA`
points it at another folder, but the folder must stay inside the repository: a
dev run must never be able to touch another instance. If the port already
answers with a different data folder, `pnpm dev` stops and names both folders.

Seed the dev database from a snapshot when you need fresh data:

```sh
pnpm dev:seed
```

The script copies the newest `*.db` file from `./.dev/seed/` into
`./.dev/xboct-log.db`. Drop a snapshot into that folder yourself — nothing in
the repository fetches it from the production host. `pnpm seed:prod --source
<path>` turns a database into such a snapshot, and the source is always explicit.

## Configuration

Paths are runtime values: nothing is baked into the build, and a checkout needs
no `.env`. `pnpm dev` sets everything itself, `pnpm build` works without any
variables, and the installer or the portable launcher passes the port and the
data folder.

The server has no default port and no default data folder. It refuses to start
without `--port <port>` and `--data <dir>` (or `XBOCT_LOG_PORT` /
`XBOCT_LOG_DATA`), and `--portable` is the only way to derive the folder — it
uses `data` next to the executable. One data folder holds everything:

| Item     | Path                        |
| -------- | --------------------------- |
| database | `<data>/xboct-log.db`       |
| media    | `<data>/media`              |
| backups  | `<data>/backups`            |
| logs     | `<data>/logs/xboct-log.log` |
| instance | `<data>/instance.json`      |

Each running instance reports a fingerprint of its data folder in
`/api/health`; a server that finds a different fingerprint on its port stops
with an error instead of attaching to someone else's data.

`XBOCT_LOG_DB`, `XBOCT_LOG_MIGRATIONS`, `XBOCT_LOG_BACKUP_DIR`, and
`XBOCT_LOG_MEDIA_DIR` belong to the legacy Node server only (`node
build/index.js`); the Rust binary derives all of them from `--data`.

`migrate:*` scripts target the dev database (`XBOCT_LOG_DEV_DB`, default
`./.dev/xboct-log.db`). Production migrations run inside the server on startup.

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

The script refuses to run while the server still listens on the port, checks the
snapshot with `PRAGMA integrity_check`, saves the current database into the
`manual` folder before replacing it, writes the new file atomically, and removes
the stale `-wal`/`-shm` files. The database path comes from `--db`, then
`XBOCT_LOG_DB`; the backup folder from `--backups`, then `XBOCT_LOG_BACKUP_DIR`.

The same list is available over MCP through the `backup_list` tool. The tool
cannot restore anything: it only reports which snapshots exist.

## Deployment

The service runs `xboct-log.exe` directly. An instance that still starts through
the old node launcher is switched once by its owner: that step rewrites a service
configuration, so it lives outside this repository.

`pnpm deploy:rust <name>` reads the rest from a per-instance file kept outside
this repository; `scripts/instance.example` shows the only key, `SERVICE`. Set
`XBOCT_LOG_INSTANCE_DIR` once to the folder that holds the `<name>.env` files.
Nothing in the repository names a production port, path or service: the app
folder, the data folder and the port are read from the service itself.

Replacing the binary means stopping the service, which a regular user may not do,
so the deploy builds and backs up as usual and then runs one elevated step through
UAC: stop, replace, start, health check. `-DryRun` needs no elevation.

## Scripts

| Command                | Description                                         |
| ---------------------- | --------------------------------------------------- |
| `pnpm dev`             | Dev server on an isolated database                  |
| `pnpm dev:seed`        | Seed `./.dev/xboct-log.db` from the newest snapshot |
| `pnpm build`           | Build for production (Node adapter)                 |
| `pnpm start`           | Run the built app through the launcher              |
| `pnpm package:win`     | Build the Windows zip (add `-Installer` for setup)  |
| `pnpm preview`         | Preview the production build                        |
| `pnpm run deploy:rust` | Deploy a named instance (see Deployment)            |
| `pnpm build:ext`       | Compile and package the VS Code extension           |
| `pnpm check`           | Type-check with `svelte-check`                      |
| `pnpm lint`            | Biome check and ESLint                              |
| `pnpm format`          | Format with Biome                                   |
| `pnpm test`            | Run unit tests with Vitest                          |
| `pnpm migrate`         | Apply pending database migrations                   |
| `pnpm restore`         | List snapshots or restore one (`list`, `restore`)   |

The `migrate:*` variants (`status`, `rollback`, `baseline`, `unlock`) are in
`package.json`.

## MCP

Every operation is exposed as an MCP tool over Streamable HTTP at `/mcp`. Point
an MCP client at `http://127.0.0.1:<port>/mcp`, where `<port>` is the port of
that instance. There is no authentication; the deployment is assumed to sit
behind a network boundary.

Before the first write of every 30-minute window the server snapshots the
database, so a botched agent session can be rolled back to the state before it
started.

## VS Code extension

`vscode-extension/` is a client that opens the board in an editor tab and starts
the local server when it is not running. Build it with `pnpm build:ext`, then
install the generated `.vsix`. Settings: `xboctLog.autoStart`,
`xboctLog.serverPath`, `xboctLog.dataDir`, `xboctLog.serverUrl`. See
`vscode-extension/README.md`.

Copying an attachment image from the webview needs the OS clipboard: the page
cannot write an image itself, so the extension host does it, and on Windows a
warm `powershell.exe` helper starts with the extension. Details and fallbacks
are in `vscode-extension/README.md`.

## Notes

Architecture map, non-obvious invariants, and deployment details are in
[`docs/notes.md`](./docs/notes.md).

## License

[MIT](./LICENSE)

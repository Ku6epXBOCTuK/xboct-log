# xboct-log

A local-first task backlog. Projects, tasks, and a kanban board on top of a
single SQLite file. Built with SvelteKit and Svelte 5.

## Features

- **Tasks** with a `PREFIX-NUMBER` id, title, description, status, priority,
  tags, epics, and closed reasons.
- **Projects** with an id, name, and task prefix. Rename, archive, and restore
  them from the sidebar.
- **Kanban board** for moving work across `open` / `in-progress` / `blocked` /
  `done`.
- **List view** with search and status/priority filters.
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

The database is created on first run at `~/.xboct-log/xboct-log.db`.

Point it somewhere else with `XBOCT_LOG_DB`:

```sh
XBOCT_LOG_DB=./tasks.db pnpm dev
```

## Backups

While the server runs it copies the database into `~/.xboct-log/backups`:

- `daily/xboct-log-YYYY-MM-DD.db` — once a day at 03:00.
- `weekly/xboct-log-YYYY-Www.db` — on Sundays at 03:00.

Old copies are pruned automatically. If the server was off at the scheduled
time, a catch-up copy runs on the next start.

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

| Command        | Description                         |
| -------------- | ----------------------------------- |
| `pnpm dev`     | Start the development server        |
| `pnpm build`   | Build for production (Node adapter) |
| `pnpm preview` | Preview the production build        |
| `pnpm check`   | Type-check with `svelte-check`      |
| `pnpm lint`    | Prettier check and ESLint           |
| `pnpm format`  | Format with Prettier                |
| `pnpm test`    | Run unit tests with Vitest          |

## License

[MIT](./LICENSE)

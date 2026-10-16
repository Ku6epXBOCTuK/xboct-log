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

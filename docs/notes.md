# Заметки: архитектура и эксплуатация

Про то, чего быстро не увидеть в коде. Что читается из кода — здесь не
повторяется.

## Карта кода

- `src/lib/server/*` — домен. На neverthrow: функции возвращают `Result` и не
  бросают исключений. Виды ошибок и их HTTP-коды — `errors.ts` (`validation`
  400, `not_found` 404, `conflict` 409, `unexpected` 500).
- `src/lib/remote/*` — HTTP-граница.
  - `registry.ts` — реестр `OpDefinition` (`name`, `description`, `input` zod,
    `kind`, `handler`).
  - `define.ts` — `defineQuery`/`defineCommand` регистрируют операцию и
    оборачивают её в SvelteKit `query`/`command`; `runOp` парсит вход, снимает
    `Result` через `unwrap`, а для `command` публикует событие изменения.
  - `index.ts` — barrel, импортирует все `*.remote.ts`. Нужен, чтобы `/mcp`
    видел полный реестр.
  - `result.ts` — `unwrap`: `Err` → `error(status, message)`.
- `src/routes/mcp/+server.ts` — MCP-**сервер в том же процессе** (Streamable
  HTTP на `/mcp`). Строит тулы из того же реестра, поэтому одна операция видна и
  в UI, и в MCP; `registry.spec.ts` держит полноту и уникальность имён.
- `src/routes/api/events/+server.ts` — SSE-поток изменений поверх
  `server/events.ts`; клиент — `src/lib/state/live.ts`. Публикует его
  `define.ts` на каждой `command`.
- `src/lib/state/*.svelte.ts` — runes-сторы UI. `src/lib/components/**` —
  компоненты. `src/lib/tasks/{filter,sort,fields}.ts` — чистая клиентская
  логика.
- `migrations/*.js` — схема. Применяет `src/lib/server/migrations.ts`
  (`@ku6epxboctuk/sqlite-up`) на старте: `hooks.server.ts` → `getDb()` →
  `migrateDatabase()` → `ensureInbox()` → `startBackupScheduler()`.
- Импорт в коде — через `#lib/...` (alias в `package.json` → `imports`), не
  `$lib`.

## Неочевидные инварианты

- **ID задачи — `PREFIX-NUMBER`** и меняется при переносе между проектами
  (`SPA-12` → `INB-3`). `moveTask` — единственное место, где переписывается
  `id`; вместе с задачей переезжает всё поддерево эпика. Номера задач **не
  переиспользуются** (`task_number_high_water`).
- **Беспроектных задач нет.** Служебный проект `inbox` (`INB`) создаётся на
  старте `ensureInbox`, архивировать его нельзя. `tasks.project_id` —
  `NOT NULL`.
- **Резолв id в тулах** (`resolveTaskId`): полный `PREFIX-NUMBER` резолвится
  всегда; голый номер — только внутри `in_project` (тогда он однозначен в
  пределах проекта) либо если уникален во всём бэклоге, иначе ошибка со списком
  кандидатов. Номер глобально не уникален: он счётчик в пределах проекта.
- **Резолв epic** (`resolveEpicId`): полный `PREFIX-NUMBER` резолвится всегда;
  голый номер — внутри проекта самой задачи (у `tasks_create` это `project_id`,
  у `tasks_update` — текущий проект задачи). Эпик обязан быть эпиком и
  принадлежать тому же проекту, иначе ошибка. Фильтр `epic_id` в `tasks_list`
  принимает голый номер: при заданном `project_id` ищется эпик с этим номером в
  проекте, без `project_id` — во всех проектах.
- **Блокеры** (`task_blocked_by`, миграция 004): связь many-to-many между
  задачами. Строка читается так: задача `blocked_task_id` заблокирована задачей
  `blocked_by_task_id`. Блокер может быть из другого проекта. Self-блок и цикл
  (в том числе транзитивный) отвергаются. Повторное добавление той же связи —
  no-op. Soft-удаление задачи снимает её связи.
- **Словарь блокеров один везде:** у задачи два списка — `blocked_by` (кто меня
  блокирует) и `blocks` (кого я блокирую); в коде параметры `blockedByTaskId`
  (кто блокирует) и `blockedTaskId` (кого блокируют).
- **Закрытие заблокированной задачи разрешено** (устарела, дубликат, обходной
  путь). Вместо запрета — автоматика: при закрытии или удалении блокера
  заблокированная задача теряет статус `blocked` → `open`, если открытых
  блокеров не осталось. Блокер считается открытым, если он не удалён и его
  статус не `done`/`cancelled`.
- **Блокеры в MCP:** команды `tasks_add_blocker` и `tasks_remove_blocker`
  (`src/lib/remote/blockers.remote.ts`). Обе принимают `id` (заблокированная
  задача) и `blocked_by` (блокер) — полный id или голый номер, плюс опциональный
  `in_project`; возвращают обновлённую заблокированную задачу. У задачи в ответе
  всегда два списка — `blocked_by` и `blocks`. Фильтры `tasks_list` с теми же
  именами: `blocked_by` — задачи, у которых в списке `blocked_by` есть данная
  задача, `blocks` — задачи, у которых в списке `blocks` есть данная задача.
- **Блокеры в UI:** в деталке задачи блок «Blocking» (`BlockingFields.svelte`):
  поле Status и поле «Blocked by» стоят рядом, потому что статус `blocked` и
  список блокеров — разные вещи. Статус ставится руками и может висеть без
  внутренних блокеров (внешняя зависимость); подсказка «mark blocked»
  появляется, когда блокеры есть, а статус ещё не `blocked`. Показывается одна
  сторона — «Заблокирована» (`blocked_by`); вторая (`blocks`) вынесена отдельно
  позже. В таблице у задачи с незакрытыми блокерами бейдж «blocked by …».
  Кандидаты в блокер исключают саму задачу, уже связанных, downstream (иначе
  цикл) и закрытые задачи (`src/lib/tasks/blocking.ts`).
- **Скоупы включаются неявно:** режим активен, если у проекта есть хотя бы один
  скоуп. «Не выбран» — это `scope_id IS NULL`, а не строка в таблице. Удаление
  скоупа оставляет задачи живыми без скоупа.
- **Удаление задачи — софт** (`deleted_at`); её номер остаётся занятым.
- **Домен не бросает.** `HttpError` появляется только на границе: `unwrap()` для
  UI, `runOp`/обработчик тула для MCP.

## Эксплуатация (prod)

- **Prod** — артефакт в `%USERPROFILE%\.xboct-log\app`, вне git. Служба NSSM
  `xboct-log`, порт `45881`, `HOST=0.0.0.0`. Старт/стоп идут из обычного
  PowerShell: DACL службы даёт `IU`/`SU` права `RP`/`WP`.
- **Деплой:** `pnpm run deploy` (не `pnpm deploy` — встроенная команда pnpm
  перехватывает имя). `scripts/deploy.ps1`: постоянный worktree
  `%LOCALAPPDATA%\xboct-log\build-wt` на `origin/main` — переиспользуется между
  деплоями (`reset --hard` + инкрементальный `pnpm install --frozen-lockfile`),
  не создаётся и не удаляется каждый раз → сборка → копирование `build`,
  `migrations`, манифеста и `scripts/start-prod.mjs` в `app` →
  `nssm stop`/`start`. Простой — только `robocopy` + рестарт (порядка 2–3 с).
- **Путь к прод-БД живёт в `app/.env`, не в коде.** Все серверные переменные
  объявлены в `src/env.ts` и читаются через `$app/env/private`; dev-сервер
  подхватывает `.env` сам, `start-prod.mjs` читает `.env` рядом с собой, деплой
  требует `app/.env` и падает без него. Без `XBOCT_LOG_DB` не собирается и
  сборка. Прод-миграции применяются внутри сервера на старте
  (`hooks.server.ts`). `scripts/migrate.mjs` — только для dev: он не читает
  `.env` и ходит в `XBOCT_LOG_DEV_DB` (по умолчанию `.dev/dev.db`), поэтому
  случайный `pnpm migrate` не может задеть прод.
- **Костыль схемы запроса.** `adapter-node` без `PROTOCOL_HEADER` считает схему
  `https` и отбивает любой не-GET как cross-site (403
  `Cross-site remote requests are forbidden`). `app/start.mjs` (=
  `scripts/start-prod.mjs`) выставляет `PROTOCOL_HEADER=x-forwarded-proto`
  **до** импорта `handler.js` и подставляет `x-forwarded-proto: http`. Иначе
  падают все remote-команды (создание, правка), а query (GET) работают.
- **Прод-`node_modules` — только runtime-зависимости.** Собранный
  `build/server/**` импортирует наружу ровно `neverthrow`, `zod`,
  `@ku6epxboctuk/sqlite-up` и `mcp-handler` (плюс peer
  `@modelcontextprotocol/server`). Чтобы `pnpm install --prod` не тянул лишнего,
  `@iconify-json/lucide` и `unplugin-icons` держатся в `devDependencies`.
- **Node ≥ 22.5** — из-за `node:sqlite`. Bun отложен (в нём `node:sqlite` нет).
- Бэкапы — см. `README.md`. Dev идёт на клоне прод-БД, а не на живой базе.

## Разработка

- `pnpm dev:clone` — копия прод-БД (через `backup()` из `node:sqlite`) в
  `.dev/dev.db`. Прод-путь берётся из `XBOCT_LOG_DB` (`.env`), живую базу читает
  в `readOnly`.
- `pnpm dev` — `scripts/dev.mjs`: dev-БД, `XBOCT_LOG_BACKUP_DISABLED=1` и
  отдельный `.dev/backups`, чтобы dev не перезаписал прод-бэкап
  `xboct-log-YYYY-MM-DD.db`. `XBOCT_LOG_DB` из `.env` игнорируется — dev всегда
  идёт на `XBOCT_LOG_DEV_DB` (по умолчанию `.dev/dev.db`). `pnpm dev:vite` —
  сырой запуск без изоляции, требует `XBOCT_LOG_DB`.
- У `XBOCT_LOG_DB` нет значения по умолчанию: без переменной сервер и скрипты
  миграций падают с ошибкой.

## Расширение VS Code

`vscode-extension/` — тонкий клиент (свои `tsconfig.json` и манифест, вне
корневого `pnpm check`). Открывает прод-URL в `WebviewPanel` с `<iframe>`.

- **Только `127.0.0.1`/`localhost`.** Из secure-контекста webview
  (`vscode-webview://`) http-iframe разрешён лишь для potentially-trustworthy
  origin; LAN-IP заблокируется как mixed content. Прод при этом слушает
  `0.0.0.0`.
- **Тема не наследуется.** Webview — кросс-доменный iframe, и
  `prefers-color-scheme` берётся от ОС, а не от редактора. Отсюда `?theme=` при
  загрузке и `postMessage { type: "xboct-log:theme" }` на смену.
- **`retainContextWhenHidden: true`** обязателен: без него переключение вкладки
  редактора перезагружает SPA.
- **Автообновление.** SvelteKit 3 (`$app/state` → `updated`) ловит новую сборку
  по `/_app/version.json`; версия = `git rev-parse HEAD` (совпадает с
  `app/version.txt`). Плашку рисует `UpdateBanner.svelte`. Молчаливый reload
  сознательно не делается: он теряет фильтры, открытую деталь и недописанную
  форму.
- Сборка: `pnpm build:ext` (`tsc -p .` + `vsce package`).

## MCP

- `/mcp`, Streamable HTTP, тот же процесс. Токена нет: `0.0.0.0:45881` уже
  открыт в сети без аутентификации, и токен на одном `/mcp` создал бы ложное
  чувство защиты.

## Сеть

Приложение работает без входа (один пользователь, одна машина), а прод слушает
`0.0.0.0:45881`. Изоляция — правило Windows Firewall на нужную подсеть/IP.

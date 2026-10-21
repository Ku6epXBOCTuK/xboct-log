# План: изоляция прода от разработки + рабочий restore

Цель: в репозитории нет ни одной строки, ведущей в живую прод-папку или БД, при
этом restore бэкапа работает даже когда приложение сломано, а dev получает
свежие данные из одностороннего канала.

Решения, принятые в обсуждении:

- Статические env-переменные — не проблема: прод собирается в build-wt со своим
  `.env`, репо-`.env` переключается на dev-пути. Вшивание прод-пути в dev-сборку
  исчезает вместе со сменой `.env`.
- **build-wt — единственный захардкоженный прод-путь в репо.** Это известный
  `%LOCALAPPDATA%\xboct-log\build-wt`, build-worktree, а не живая папка
  приложения. Он же — точка входа для чтения остального конфига.
- Путь к прод-папке приложения (`XBOCT_LOG_APP_DIR`) берётся из `build-wt\.env`,
  в коде деплоя не хардкодится.
- Restore — прод-операция, живёт в прод-папке (`app\restore.mjs`), пути читает
  из `app\.env`, который кладёт деплой из `build-wt\.env`.
- Клонирование с живого прода не нужно: dev сидируется снимком из `.dev/seed/`.

Ничего не коммитим по ходу работ.

---

## Фаза 1. Репо становится dev-only (25 мин)

1. `.env` в корне — заменить на dev-значения, без прод-путей:

   ```
   XBOCT_LOG_DB=.dev/dev.db
   XBOCT_LOG_MIGRATIONS=migrations
   XBOCT_LOG_BACKUP_DIR=.dev/backups
   XBOCT_LOG_BACKUP_DISABLED=1
   ```

   Относительные пути работают: `vite dev`/`preview` запускаются из корня репо.
   `.env` в `.gitignore`.

2. `.env.example` — те же dev-значения + комментарий, что прод-пути живут в
   `build-wt\.env` и в репо не попадают.

3. `package.json`:
   - удалить `dev:clone`;
   - добавить `"dev:seed": "node scripts/dev-seed.mjs"`;
   - `restore` оставить, он теперь бьёт в dev-БД (полезно для проверки
     восстановления).

4. Удалить `scripts/dev-clone.mjs`. Создать `scripts/dev-seed.mjs`:
   - находит самый свежий `*.db` в `.dev/seed/`;
   - копирует через `node:sqlite` `backup()` в `.dev/dev.db`;
   - печатает источник, mtime и размер;
   - пустая папка → понятная ошибка, не пустой файл.

5. Создать `.dev/seed/` (`.dev` уже в `.gitignore`). Туда руками кладётся снимок
   прод-БД или свежий daily-бэкап.

Проверка: `pnpm test` и `pnpm build` зелёные; `pnpm dev` пишет
`database: ...\.dev\dev.db`; в `.env`, `.env.example`, `scripts/`,
`package.json` нет прод-путей.

---

## Фаза 2. Деплой носит restore и env в прод-папку (40 мин)

### 2.0 Разовая настройка вне репо (5 мин)

Дописать в `%LOCALAPPDATA%\xboct-log\build-wt\.env`:

```
XBOCT_LOG_APP_DIR=C:\Users\Ku6epXBOCTuK\.xboct-log\app
```

Проверить, что там уже есть `XBOCT_LOG_DB` и `XBOCT_LOG_BACKUP_DIR`.
`XBOCT_LOG_SERVICE` не нужен — имя службы остаётся литералом `xboct-log` в
`deploy.ps1` (это имя, не путь).

### 2.1 Переписать `scripts/deploy.ps1` (15 мин)

- Оставить единственный захардкоженный путь:
  ```powershell
  $BuildWt = Join-Path $env:LOCALAPPDATA "xboct-log\build-wt"
  ```
  Он же — граница доверия: всё остальное читается из этого worktree.
- Прочитать `$BuildWt\.env` простым парсером (`KEY=VALUE`, `#` — комментарий,
  пустые строки пропускаются).
- `$AppDir = $Cfg["XBOCT_LOG_APP_DIR"]`, нет значения → throw. Это происходит до
  первого касания прода (fail-closed).
- Убрать литерал `Join-Path $env:USERPROFILE ".xboct-log\app"`.
- После копирования `start-prod.mjs`:
  ```powershell
  Copy-Item (Join-Path $BuildWt ".env") (Join-Path $AppDir ".env") -Force
  Copy-Item (Join-Path $BuildWt "scripts\restore.mjs") (Join-Path $AppDir "restore.mjs") -Force
  ```
- Остальная логика (worktree, build, robocopy, nssm, version.txt) без изменений.

### 2.2 `scripts/restore.mjs` (15 мин)

1. Порядок источников путей: флаги `--db`/`--backups` → `process.env` →
   `app\.env` рядом со скриптом (`process.loadEnvFile`, не перетирая уже
   заданные переменные) → ошибка. Текст ошибки переписать без упоминания
   `--env`.
2. Хардненинг `restore`:
   - проверка, что файл — SQLite (`header startsWith "SQLite format 3"`) — уже
     есть;
   - проверка, что в базе есть таблица `schema_migrations` (защита от
     восстановления случайного файла);
   - `PRAGMA integrity_check` на снимке до замены;
   - pre-restore копия текущей БД в `manual/` через sqlite `backup()` — уже
     есть;
   - писать в `<db>.new`, затем `renameSync` поверх — никакого полузаписанного
     файла;
   - удалять `-wal`/`-shm` — уже есть;
   - печатать дату снимка, размер и `projects`/`tasks` count;
   - финальная подсказка `nssm start xboct-log`.
3. `list` не меняется.

### 2.3 MCP-описание (5 мин)

`src/lib/remote/backup.remote.ts`: в `backup_list` заменить
`'pnpm restore restore <path>'` на «запусти `restore.mjs` из папки приложения
при остановленной службе» — без путей.

### 2.4 Проверка (10 мин)

- `node scripts\restore.mjs list` видит `.dev/backups` (через dev-`.env`).
- Восстановление на копию `.dev/dev.db` отрабатывает; pre-restore копия
  появляется в `.dev/backups/manual/`.
- `pnpm run deploy` на текущем `origin/main`: `app\.env` и `app\restore.mjs` на
  месте, служба `SERVICE_RUNNING`.

---

## Фаза 3. Механический барьер (20 мин)

1. `scripts/check-paths.mjs`: обходит `git ls-files`, ищет `\.xboct-log`,
   `xboct-log\\app`, `build-wt`, `nssm`. Падает со списком `файл:строка`.
2. Единственное разрешённое исключение — строка с `$BuildWt` в
   `scripts/deploy.ps1`. Реализовать как явный allowlist `{file, pattern}`, а не
   как «пропустить весь файл», чтобы остальные прод-строки в деплое ловились.
3. `package.json`:
   `"lint": "prettier --check . && eslint . && node scripts/check-paths.mjs"`.
4. Прогнать и вычистить найденное: `docs/notes.md` (разделы «Эксплуатация»,
   «Бэкапы», «Разработка») и `README.md`. Литералы заменить на `<prod-app-dir>`,
   `<prod-db>`, `<prod-backups>`.

---

## Фаза 4. Документация (15 мин)

1. `README.md`:
   - `pnpm dev:clone` → `pnpm dev:seed`, описать `.dev/seed/`;
   - раздел Restoring: `node "<app-dir>\restore.mjs" list|restore <file>`, без
     `pnpm`, без прод-литералов.
2. `docs/notes.md`:
   - абзац «`app/.env` не существует и не нужен» инвертировать: создаётся
     деплоем из `build-wt/.env`, его читает `restore.mjs`;
   - в описание деплоя добавить: build-wt — единственный захардкоженный путь,
     конфиг читается из его `.env`, в `app` копируются `.env` и `restore.mjs`;
   - `dev:clone` → `dev:seed`;
   - в раздел бэкапов дописать новый порядок restore (integrity → `.new` →
     rename).

---

## Фаза 5. Приёмка (10 мин)

1. `pnpm lint` (включая `check-paths`), `pnpm test`, `pnpm build` — зелёные.
2. Новый терминал: `pnpm dev` → в логе `database: ...\.dev\dev.db`.
3. Ручной деплой → `app\.env` и `app\restore.mjs` на месте.
4. Боевая проверка restore:
   ```powershell
   nssm stop xboct-log
   node "$env:USERPROFILE\.xboct-log\app\restore.mjs" list
   node "$env:USERPROFILE\.xboct-log\app\restore.mjs" restore <старый снимок>
   nssm start xboct-log
   ```
   Ожидается: pre-restore копия в `manual/`, чистый `integrity_check`, counts в
   выводе, служба поднялась.
5. Итог: в репо нет ни одной строки, ведущей в живую прод-папку или БД; restore
   работает без репо и без `node_modules`.

---

## Изменяемые файлы

- `.env`, `.env.example`
- `package.json`
- `scripts/dev-seed.mjs` (новый), `scripts/dev-clone.mjs` (удалить)
- `scripts/deploy.ps1`
- `scripts/restore.mjs`
- `scripts/check-paths.mjs` (новый)
- `src/lib/remote/backup.remote.ts`
- `README.md`, `docs/notes.md`

## Риски

- `build-wt` захардкожен сознательно: это цена единой известной точки входа.
  Путь ведёт в build-worktree, а не в живую БД, и перезаписывается только
  деплоем.
- `app\.env` теперь содержит прод-пути: это прод-папка, ожидаемо. Копировать её
  в репо нельзя — `check-paths` этого не ловит, полагаемся на `.gitignore` и
  здравый смысл.
- Старый снимок на текущем коде безопасен (миграции догоняют на старте). Новый
  снимок на старом коде — нет: откат кода требует согласованной пары
  `app/version.txt` + `build-wt` на нужном коммите.
- Если `build-wt\.env` сломается, деплой упадёт до касания прода — это желаемое
  поведение, но восстановить `.env` придётся руками.

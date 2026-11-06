# Переписывание на Rust

Цель — сервер на Rust для деплоя на VPS. Не порт: серверная часть проектируется
заново. Сохраняются фронтенд-компоненты и внешние контракты — URL, SSE, медиа,
`/mcp`, формат ошибок.

## Что остаётся и что уходит

Остаётся: 106 `.svelte`, URL-схема, SSE-события, `{kind, message}` в ошибках,
эндпоинты `/api/events`, `/media/[id]`, `/api/health`, `/mcp`.

Уходит: `adapter-node`, remote functions, Zod-контракты, `registry.ts` как
абстракция над операциями, `neverthrow`, кастомная SQL-функция `ULOWER`,
26 отдельных миграций.

## Крейты

```
crates/core      домен, sqlx, миграции, медиа, бэкапы, шедулер (без axum)
crates/server    axum, HTTP DTO, SSE, MCP, встраивание SPA
crates/cli       импорт старой БД, backup/restore, админ-команды
```

`core` не знает про HTTP и MCP. Трейты-репозитории не вводятся: свободные
функции с `&SqlitePool`. Это не мешает тестам — они идут на реальной SQLite
в памяти или временном файле.

## Модель данных

- Newtype'ы: `ProjectId`, `TaskKey` (`PREFIX-N` с парсингом), `ScopeId(i64)`,
  `AttachmentId`.
- Enum'ы через `#[derive(sqlx::Type)]` + `rename_all = "kebab-case"`: `Status`,
  `Priority`, `ClosedReason`, `Estimate`, `EntityKind`, `ActivitySource`.
- `ULOWER` заменяется нормализованными колонками (`title_lower`,
  `prefix_lower`, `key_lower`, `search_text`), заполняемыми при записи, с
  индексами. Поиск идёт по индексу, а не по выражению.
- Валидация — `garde` на request-DTO. Ошибки — `thiserror`-enum
  `DomainError { Validation, NotFound, Conflict }`; `anyhow` только в `main` и
  CLI. `AppError` с `IntoResponse` живёт в `server`.

## sqlx и миграции

Один `migrations/0001_init.sql` вместо 26 файлов, `sqlx::migrate!()`,
таблица `_sqlx_migrations`.

Итоговая схема совпадает с текущей по колонкам и типам, поэтому старая база
открывается напрямую. При старте: если есть `schema_migrations`, а
`_sqlx_migrations` нет — baseline помечается применённым. Скрипт переноса
данных не нужен. Переименования колонок — отдельной миграцией позже.

Запросы — `sqlx::query_as!` с закоммиченным `.sqlx/` (`cargo sqlx prepare`):
дрейф схемы ловится на компиляции, сборка остаётся герметичной. Динамический
фильтр задач — `QueryBuilder` с `push_bind`.

Транзакции начинаются как `BEGIN IMMEDIATE` (`begin_with`), иначе WAL и
параллельные писатели дают `SQLITE_BUSY`.

## HTTP и типизация фронтенда

`utoipa` уместен, потому что HTTP-DTO отдельные от MCP-аргументов:

```
domain-типы (core)
  ├─ HTTP DTO: Serialize + ToSchema     → utoipa → OpenAPI
  └─ MCP args: Serialize + JsonSchema   → rmcp (schemars обязателен)
```

`/api/openapi.json` → `openapi-typescript` → `src/lib/api/schema.d.ts` →
`openapi-fetch`. Ручных типов и `json-schema-to-typescript` нет.

Состояние: TanStack Query Svelte вместо самописных сторов и
`refresh()/current`. SSE-события инвалидируют ключи запросов. Сторы остаются
для UI-состояния — выделение, фильтры, раскрытые узлы.

Фронт: `adapter-static`, SPA-fallback, `+layout.ts` без server load,
начальные данные — обычные запросы.

## Подсистемы

- **MCP** — `rmcp` ≥ 1.4.0, Streamable HTTP на `/mcp`. Allowlist хостов
  обязателен: RUSTSEC-2026-0189 (DNS rebinding).
- **SSE** — `axum::response::sse` + `tokio::sync::broadcast`, heartbeat 15 с,
  заголовки `no-transform` и `x-accel-buffering: no`.
- **Auth** — сессионная cookie (HttpOnly, SameSite=Lax) для браузера и iframe
  расширения, bearer-токен для MCP и CLI, один middleware. TLS на Caddy.
- **Медиа, бэкапы, ретенция, шедулер** — в `core`, те же env-переменные.
  SPA встраивается через `rust-embed`.

## Фазы

1. Каркас: конфиг, миграции, baseline, health, статика, systemd/Caddy — 2 дня.
2. `core`: схема, типы, CRUD задач с move/renumber и поддеревом эпика,
   фильтры — 2 недели.
3. Остальные ресурсы, OpenAPI, генерация клиента — 1.5 недели.
4. MCP, SSE, медиа, бэкапы, auth — 1 неделя.
5. Фронтенд: удаление remote-функций, api-клиент, TanStack Query — 1 неделя.
6. Тесты: порт 12k строк специй и набор на API — 2–3 недели, параллельно.

Итого 9–11 недель соло.

## Риски

- Точная семантика move/renumber и поддерева эпика — главный источник
  расхождений.
- MCP-схемы должны остаться совместимыми с уже настроенными клиентами.
- Совместимость файла БД проверяется на копии рабочей базы, не на пустой.

## Открытые вопросы

- Нужна ли аутентификация на VPS или доступ остаётся в пределах WireGuard.
- Остаётся ли VSCode-расширение на iframe или переходит на отдельное окно.
- Судьба двух текущих инстансов: оба переезжают или Windows остаётся.

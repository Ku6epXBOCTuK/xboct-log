# Скоупы задач: план работ

Дополнение к `plan.md`. Появляется третья ось группировки задач внутри проекта —
скоуп. Сейчас осей две: проект (обязательная) и эпик (опциональная связь между
задачами). Скоуп это независимая ось: он не задача и не проект.

## Задача

У каждого проекта могут быть свои типы/скоупы (например, `frontend`, `backend`,
`infra`). Любая задача должна принадлежать ровно одному скоупу. В простых
проектах скоупами не заморачиваются, поэтому нужен технический скоуп «не
выбран»: задачи без скоупа существуют, но в проектах, где скоупы заведены, они
подсвечиваются и просят триаж.

## Решения

**Скоупы принадлежат проекту, а не глобальны.**

Причина: у разных проектов разные наборы скоупов. Глобальный список с включением
подмножества на проект — это лишний слой; если позже понадобятся межпроектные
отчёты, шаблоны скоупов добавятся отдельно.

**«Не выбран» это `scope_id IS NULL`, а не строка в таблице.**

Причина: не нужны синтетические строки и автосоздание служебного скоупа для
каждого проекта. Удаление скоупа естественно оставляет его задачи без скоупа и
подсвечивает их. В селекте «не выбран» — это специальный пункт, а не запись в
`scopes`.

**Режим скоупов включается неявно: у проекта есть хотя бы один скоуп.**

Причина: не нужен флаг `projects.scopes_enabled`. Пока скоупов нет, колонка,
бейдж и селект скоупа не показываются, и валидация не требует скоуп. Как только
в проекте появился первый скоуп, UI начинает спрашивать скоуп и подсвечивать
задачи без него. Удалили все скоупы — режим выключился сам.

**Удаление скоупа не удаляет задачи.**

Причина: задачи это данные, скоуп это метка. `ON DELETE SET NULL` в схеме плюс
подтверждение в UI, которое показывает, сколько задач станет «не выбрано».

**Задача и скоуп должны быть в одном проекте.**

Причина: скоуп принадлежит проекту. При переносе задачи в другой проект
(`moveTask`) скоуп сбрасывается в `NULL` — старый скоуп остался в старом
проекте. Это надо сделать внутри существующей транзакции `moveTask`.

**Идентификатор скоупа — целое, а не слаг.**

Причина: скоуп живёт внутри проекта и не попадает в URL как сущность верхнего
уровня, как `id` проекта. Переименование не должно менять идентификатор.

## Модель данных (`migrations/002_scopes.js`)

```sql
CREATE TABLE scopes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  TEXT NOT NULL REFERENCES projects (id),
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  UNIQUE (project_id, name)
);

ALTER TABLE tasks ADD COLUMN scope_id INTEGER REFERENCES scopes (id) ON DELETE SET NULL;

CREATE INDEX idx_scopes_project ON scopes (project_id);
CREATE INDEX idx_tasks_scope ON tasks (scope_id);
```

Ограничения, которые важно помнить:

1. `ALTER TABLE ... ADD COLUMN` с `REFERENCES ... ON DELETE SET NULL` в SQLite
   разрешён, пока дефолт `NULL`. Отдельная транзакция не нужна.
2. `down` не сможет убрать колонку обычным `ALTER TABLE DROP COLUMN`, потому что
   на неё ссылается внешний ключ. Откат пересобирает `tasks` (создать
   `tasks_new` без колонки, скопировать, дропнуть, переименовать) либо, если
   откат считаем нерабочим путём, просто роняет индексы и таблицу `scopes`.
3. `PRAGMA foreign_keys = ON` уже включён в `db.ts`, поэтому
   `ON DELETE SET NULL` сработает сам. Явный `UPDATE tasks SET scope_id = NULL`
   в `deleteScope` всё равно оставляем — детерминированно и не зависит от прагм.

## Шаги

Оценка суммарно около 6 часов.

### Шаг 1. Схема и домен (1.5 ч)

1. `migrations/002_scopes.js` — таблица, колонка, индексы (см. выше), `up` и
   `down`.
2. `src/lib/types.ts` — интерфейс `Scope` (`id: number`, `project_id`, `name`,
   `created_at`), поле `scope_id: number | null` в `Task`, `NewTask`,
   `TaskPatch`, `TaskQuery`. Экспорт константы для значения фильтра, если
   понадобится.
3. `src/lib/server/scopes.ts` — новый модуль на neverthrow:
   - `listScopes(db, projectId): Scope[]` — по алфавиту;
   - `scopedProjectIds(db): string[]` — множество проектов, у которых есть хотя
     бы один скоуп (нужно UI для подсветки «не выбран»);
   - `countTasksByScope(db, projectId): Record<number, number>` — для диалога и
     фильтра;
   - `createScope(db, { project_id, name })` — имя через `trim`, пустое
     отклоняем, дубликат по `(project_id, name)` отдаём как конфликт;
   - `updateScope(db, id, { name })` — переименование с той же валидацией;
   - `deleteScope(db, id)` — в транзакции
     `UPDATE tasks SET scope_id = NULL WHERE scope_id = ?`, затем
     `DELETE FROM scopes`.
4. `src/lib/server/tasks.ts`:
   - в `NewTask`/`TaskPatch`/`TaskQuery` добавить `scope_id`;
   - `validateScope(db, scopeId, projectId)` рядом с `validateEpic`: скоуп
     существует и `scope.project_id === projectId`;
   - `createTask`/`updateTask` вызывают проверку только когда `scope_id` не
     `null`;
   - `listTasks` — фильтр `scope_id`: число → `scope_id = ?`, `null` →
     `IS NULL`;
   - `mapTask` и `TaskRow` читают `scope_id`;
   - `moveTask`: внутри существующей транзакции для каждого узла поддерева
     `scope_id = NULL`.

### Шаг 2. API (45 мин)

1. `src/lib/remote/scopes.remote.ts` — новый файл:
   - `getScopes` — `query(z.string().min(1), (projectId) => ...)`;
   - `createScope`/`updateScope`/`deleteScope` — `command`, домен через
     `unwrap`.
2. `src/lib/remote/tasks.remote.ts` — добавить
   `scope_id: z.number().int().nullable().optional()` в `newTask`, `taskPatch` и
   в `taskFilters`.
3. Тесты в стиле существующих `src/lib/server/*.spec.ts`.

### Шаг 3. Клиентское состояние (45 мин)

1. `src/lib/state/scopes.svelte.ts` —
   `createScopeStore(initial: Record<string, Scope[]>)` или плоский список:
   `byProject`, `create`, `rename`, `destroy`, `countFor(scopeId)`. Список
   проектов со скоупами — производное.
2. `src/lib/state/filters.svelte.ts` — поле `scope` со значениями
   `"any" | "none" | <id>`; добавить в `clear()`.
3. `src/lib/tasks/filter.ts` — учесть `scope` в `filterTasks`, добавить
   `countTasksInScope`.
4. `src/routes/+page.svelte` — загрузить скоупы (`getScopes` по проектам или
   один `getScopes` со всеми), передать в сторы и вниз в компоненты.

### Шаг 4. Управление скоупами (1.5 ч)

1. `src/lib/components/projects/ProjectSettingsDialog.svelte` — новый модальный
   диалог: переименование проекта, архивация и секция «Scopes» со списком (имя,
   число задач, инлайн-переименование, удаление с подтверждением
   `N tasks will become unassigned`), поле добавления.
2. `src/lib/components/projects/ProjectRow.svelte` — иконка-шестерёнка, новый
   проп `onsettings()`.
3. `src/lib/components/projects/ProjectSection.svelte` — состояние
   `settingsFor: string | null`, открытие диалога, применение изменений к сторам
   проектов и скоупов.

### Шаг 5. Скоуп в задачах и фильтрах (1.5 ч)

1. `src/lib/components/detail/DetailFields.svelte` — селект `Scope`,
   показывается только если у проекта задачи есть скоупы; первый пункт «not
   selected»; новый проп `onscope(scopeId: number | null)`; подсветка, когда
   задача без скоупа в проекте со скоупами.
2. `src/lib/components/detail/DetailPanel.svelte` — прокид `onscope` в
   `tasks.save({ scope_id })`.
3. `src/lib/components/newtask/TaskForm.svelte` — селект `Scope` (по проекту
   формы, по умолчанию «not selected»), сброс при смене проекта, передача
   `scope_id` в `create`.
4. `src/lib/components/table/TaskRow.svelte` — бейдж скоупа в имени задачи;
   когда проект со скоупами и `scope_id === null`, бейдж `no scope` в
   предупреждающем цвете.
5. `src/lib/components/filters/ScopeFilter.svelte` — новый, по образцу
   `EpicFilter`: `Scope: any / none / <name> (count)`; подключить в
   `MetaRow.svelte`.

## Краевые случаи

1. Перенос задачи в другой проект сбрасывает скоуп — иначе ссылка через границу
   проекта.
2. Удаление скоупа оставляет задачи живыми без скоупа.
3. Имя скоупа уникально в пределах проекта (после `trim`).
4. У архивного проекта скоупы не показываются в селектах создания.
5. Переименование скоупа не трогает задачи.

## Вне области работ

1. Архивация скоупов (пока только удаление).
2. Ручной порядок скоупов (пока по алфавиту).
3. Глобальные скоупы-шаблоны и общие для нескольких проектов.
4. Цвета скоупов.
5. Перенос скоупа между проектами.

## Критерии готовности

1. В диалоге проекта можно добавить, переименовать и удалить скоуп.
2. Удаление скоупа не удаляет задачи и превращает их в «не выбран».
3. После появления первого скоупа в проекте селект скоупа появляется в форме и
   карточке, а задачи без скоупа помечены как `no scope`.
4. Можно отфильтровать задачи по скоупу, включая вариант «без скоупа».
5. В проекте без скоупов про скоупы ничего не напоминает.
6. Перенос задачи в другой проект сбрасывает скоуп.
7. `pnpm test` и `pnpm check` проходят.

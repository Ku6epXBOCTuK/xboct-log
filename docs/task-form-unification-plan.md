# Унификация формы задачи и визуал под VSCode: план работ

В приложении два почти одинаковых потока работы с задачей, и они отображаются
по-разному. Задача: решить, оставлять ли две поверхности, убрать дублирование и
починить вёрстку под окно VSCode ~1660×753.

## Контекст

Приложение работает в VSCode через `vscode-extension/src/extension.ts`, который
грузит его в `<iframe>` (100%×100%) внутри webview-панели.

- **Создание**: `+page.svelte` (`creating`) → `NewTaskModal.svelte`
  (`<dialog class="modal-panel">`) → `TaskForm.svelte` — форма с одним `submit`
  → `tasks.create()`.
- **Редактирование**: `+page.svelte` (`selected`) → `DetailPanel.svelte`
  (`<aside class="detail-panel">`) → `DetailFields.svelte` +
  `DetailActions.svelte` — автосейв по полю (`onchange` → `tasks.save` /
  `moveTo`) плюс жизненный цикл close/reopen/delete.

Проблемы: дублирование разметки, стилей и валидации; одинаковая сущность
выглядит по-разному; при высоте 753px в модалке футер с «Create task» уезжает за
край (у `.modal-panel` есть `max-height`, но нет внутренней прокрутки).

## Решения

**Две поверхности остаются: модалка на создание, боковая панель на
редактирование.**

Причина: семантика разная. Создание — транзиентное, с батчем «Create another».
Редактирование — живой объект с автосейвом, статусами и жизненным циклом, при
этом список задач остаётся видимым. Проблема не в двух поверхностях, а в том,
что одинаковые данные выглядят по-разному.

**Объединяются только внутренности.**

Общий презентационный компонент полей `TaskFields.svelte`, общий CSS полей в
`app.css`, общая валидация в `fields.ts`. Обёртки (модалка/панель) остаются
тонкими и отвечают за своё: submit vs автосейв.

**Единый порядок полей — группировка как в edit.**

статус/приоритет/тип → проект/эпик/скоуп → мета → описание.

**`TaskFields` живёт в новой папке `src/lib/components/task/`.**

**Внешние паддинги shell → 0.**

Причина: VSCode уже даёт рамку вокруг, отступы приложения только тратят место
при ограниченной высоте.

**Диалоги: flex-колонка со скроллящейся серединой, плюс 2 колонки в модалке.**

Хедер и футер всегда видны — всегда можно закрыть или создать задачу.

## Текущие внешние паддинги (до обнуления)

| Где              | Файл                     | Паддинг                                                    |
| ---------------- | ------------------------ | ---------------------------------------------------------- |
| Сайдбар          | `SideBar.svelte`         | `24px / 12px / 16px`                                       |
| Хедер воркспейса | `WorkspaceHeader.svelte` | `24px` со всех сторон                                      |
| Панель деталей   | `DetailPanel.svelte`     | `24px / 24px / 32px`                                       |
| Ячейки таблицы   | `TaskTable.svelte`       | `th` 12px; id-col/date-col +24px                           |
| Модалка          | `NewTaskModal.svelte`    | inset `max-height: 100vh - 48px`, без внутренней прокрутки |

## Уже общее (не дублировать)

- `src/lib/tasks/fields.ts`: `TaskPatch`, `splitTags`, `toSourceFile`,
  `toSourceLine`, `epicsForProject`, `siblingEpics`.
- `src/app.css` глобальные классы: `.detail-grid`, `.detail-field`,
  `.icon-button`, `.new-task`, `.close-detail`, `.epic-badge`, `.detail-error`.

## Дублируется (убрать)

- CSS-блок `label` / `input` / `select` / `textarea` — дословно в
  `TaskForm.svelte`, `DetailFields.svelte`, `DetailActions.svelte`.
- Валидация: `title cannot be empty`, `source line must be a whole number`,
  `source line requires source file` — в двух местах.
- Разметка полей epic/scope/tags/source/description — почти идентична.

## Различия полей

- Общие: project, title, description, priority, type, epic, scope, tags, source
  file/line.
- Только edit: status, closed date, closed reason, ID-бейдж, «updated …»,
  жизненный цикл.
- Только create: «Create another».

## Порядок шагов

### Шаг 1. Внешние паддинги → 0

- В `app.css` добавить токен `--edge-pad: 0` (одна строка → легко вернуть, если
  станет тесно).
- `SideBar.svelte`, `WorkspaceHeader.svelte`, `TaskTable.svelte`
  (th/id-col/date-col), `+page.svelte` — внешние отступы привязать к
  `--edge-pad`, убрать захардкоженные `space-6`.
- Проверка: контент прижат к краям iframe, скролл таблицы работает.

### Шаг 2. Общий CSS полей → `app.css`

- Вынести блок `label` / `input` / `select` / `textarea` из scoped-стилей
  `TaskForm` и `DetailFields` в классы `.field` + `.field-control`.
- Вешать на классы, **не** на голый `label` (иначе протечёт на фильтры/сайдбар).

### Шаг 3. Валидация → `fields.ts`

- `validateTaskDraft({ title, source_file, source_line }) → string | null` с
  текущими сообщениями.
- Использовать в `TaskForm.submit` и в обработчиках `DetailPanel`.

### Шаг 4. `TaskFields.svelte` + переключить обёртки

- Пропсы: объект значений + флаги видимости edit-only полей (`status`,
  `closed_at`, `closed_reason`, `progress-meta`) + `onfield(patch: TaskPatch)` +
  отдельный `onproject`.
- Title **не** входит — каждая обёртка рендерит его сама.
- `TaskForm`: локальный `draft`, `onfield` → `Object.assign`.
- `DetailPanel`: `onfield` → `save(patch)`, `onproject` → `moveTo`.
- `DetailFields.svelte` удалить.
- Проверка: создание и редактирование работают как раньше, поля выглядят
  одинаково.

### Шаг 5. Диалоги под высоту 753px

- `NewTaskModal`: `.modal-panel` →
  `flex column; max-height calc(100dvh - 2*--edge-pad); overflow hidden`;
  `.modal-top` → `flex:none`.
- `TaskForm`: форма → `flex column; flex:1; min-height:0`; поля в скроллящемся
  блоке; `.modal-actions` → `flex:none` + `border-top`, прибит к низу.
- Модалку расширить до ~720px и разложить поля сеткой в 2 колонки.
- `DetailPanel`: `.detail-panel` → flex-колонка; фиксированный верх
  (`.detail-top` + title + `ErrorNote`) `flex:none`; `DetailFields` скроллится
  `flex:1; min-height:0`; `DetailActions` → `flex:none` + `border-top`.
- `DetailActions`: футер не скроллится и не перекрывает поля.

### Шаг 6. Проверка на 1660×753

- Создание: хедер и «Create task» видны без скролла; скроллятся только поля.
- Редактирование: крестик и Close/Reopen/Delete всегда видны.
- Тумблер темы, фильтры, пустое состояние не сломались.

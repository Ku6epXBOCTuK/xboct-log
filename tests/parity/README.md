# Parity harness

Снимает внешнюю границу node-версии, чтобы Rust-порт сверялся с ней по файлам, а
не по памяти. Снапшоты лежат в `fixtures/` и коммитятся.

## Команды

```powershell
pnpm parity:capture                       # перегенерировать fixtures из node
pnpm parity:seed --out tests/parity/.tmp/x  # только база
pnpm parity:check                         # два прогона + сверка с fixtures
pnpm parity:compare --expected <dir> --actual <dir>
pnpm parity:compare --self-test           # проверка, что сравнение ловит порчу
```

`parity:check` — то, что должно быть зелёным в пайплайне: два независимых захвата
совпадают между собой и с закоммиченными снапшотами.

## Файлы

| Файл                     | Что внутри                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `fixtures/db.json`       | канонический слепок схемы (`sqlite_master`, `PRAGMA table_info`) и строк всех таблиц                         |
| `fixtures/contract.json` | 55 операций с input/output JSON Schema, MCP `initialize`/`tools/list`/оба ресурса, `GET /mcp`, `/api/health` |
| `fixtures/ops.json`      | 74 вызова всех операций, 8 ошибочных кейсов через MCP, кадры SSE, байты медиа с `sha256` и путями бэкапов    |

## Как это устроено

1. `seed.node.spec.ts` создаёт базу с нуля через `runOp` и пишет `db.json`.
2. `capture.node.spec.ts` открывает ту же базу и снимает контракт.
3. `ops.node.spec.ts` прогоняет операции и ошибочные кейсы, пишет `ops.json`.
4. `compare.mjs` рекурсивно диффит `*.json` и печатает пути до полей.

Проект `parity` в `vite.config.ts` включается только при `XBOCT_LOG_PARITY=1`, идёт
без shuffle и параллелизма, чтобы порядок вызовов и `seq` событий совпадали.
Скретч-каталог `tests/parity/.tmp/` в `.gitignore`; `fixtures/` исключён из biome,
иначе форматтер меняет байты.

## Нормализация

Всё недетерминированное заменяется на метки до записи в снапшот:

- uuid задач, вложений и комментариев — `<task:SPA-2>`, `<attachment:3>`,
  `<comment:1>`;
- свежие отметки времени — `<now>`, фиксированные даты (`due_at`) остаются как есть;
- абсолютные пути внутри рантайма — `<runtime>`, имена бэкапов — `<stamp>`;
- строки, похожие на JSON, разбираются и нормализуются рекурсивно;
- `relates_to` — симметричная связь, её концы сортируются: node пишет пару в
  случайном порядке uuid.

## Rust

`crates/parity` — сторона Rust: `parity-capture` (бин `parity-capture`) читает ту
же базу, что засеял node, и пишет `db.json` в `--actual` тем же нормализатором,
что и `tests/parity/lib/normalize.ts`. `_sqlx_migrations` — единственная таблица,
которую захват пропускает.

```powershell
pnpm parity:rust    # засеять базу через node, снять Rust, сверить db.json
```

`source` остаётся `ui`, как у node, иначе ответы и журнал активности разойдутся.
Сравнение — тот же `compare.mjs --expected fixtures --actual tests/parity/.tmp/rust`
(по умолчанию он смотрит именно туда).

Пока реестр операций Rust отстаёт от плана, `parity-capture` печатает
недостающие имена и выходит с кодом 1: `crates/parity/src/plan.rs` держит порядок
вызовов `ops.node.spec.ts`, сверка автоматическая, список не пишется руками.

Сверять можно по частям: `compare.mjs --only db.json` или
`--only ops.json#calls,events` — это нужно, пока часть поверхности ещё не
перенесена (`contract.json` требует готового MCP).

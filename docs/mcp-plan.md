# План: MCP-сервер внутри xboct-log

## Итог, к которому идём

- MCP живёт **в том же процессе**, что и приложение: эндпоинт
  `src/routes/mcp/+server.ts`.
- Один источник правды — реестр операций `src/lib/remote/registry.ts`. Из него
  строятся и remote functions для UI, и MCP-тулы. Отдельного обслуживания MCP не
  существует.
- Транспорт — Streamable HTTP (`/mcp`), только HTTP-клиенты. Stdio-мост не
  нужен.
- Отдельных `/api/mcp/manifest` и `/api/rpc` **нет**: раньше я их предлагал для
  внешнего stdio-процесса, теперь MCP в том же процессе и читает реестр
  напрямую.

## Пакеты (проверено по registry и README)

| Пакет                          | Версия                   | Роль                                                                                                                                                                                                         |
| ------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@modelcontextprotocol/server` | `^2.0.0` (latest 2.3.1)  | Официальный MCP SDK v2, спека 2026-07-28. `McpServer.registerTool()`, схемы через Standard Schema (zod v4 — из коробки)                                                                                      |
| `mcp-handler`                  | `^2.1.1` (latest 2.3.0)  | Vercel: `createMcpHandler(cb)` → web-standard `(Request) => Response`. В README прямо указана поддержка SvelteKit. Stateless, Redis не нужен. Peer: `@modelcontextprotocol/server@^2.0.0`, `next` — optional |
| `zod`                          | `^4.6.7` — уже в проекте | Требование mcp-handler — `>=4.2.0`, подходит                                                                                                                                                                 |

`inputSchema` в `registerTool` принимает **полную** zod-схему
(`z.object({...})`), а не сырой shape — в реестре схемы уже такие.

## Архитектура

```txt
src/lib/remote/registry.ts        ← OpDefinition: name, description, input (zod), handler
        │
        ├─→ defineQuery/defineCommand  →  *.remote.ts  →  UI (SvelteKit remote functions)
        │        (реестрирует операцию автоматически)
        │
        └─→ src/routes/mcp/+server.ts  →  createMcpHandler:
                 итерирует реестр, registerTool на каждую операцию,
                 handler = тот же хендлер реестра, ошибки AppError → isError
```

Добавил операцию в реестр — она автоматически видна в UI и в MCP. Тест
гарантирует полноту реестра.

## Шаги

### Шаг 1. Зависимости (~2 мин)

```bash
pnpm add mcp-handler @modelcontextprotocol/server
```

В `dependencies` (не dev!) — нужны в prod-сборке.

### Шаг 2. Реестр операций (~15 мин)

Создать `src/lib/remote/registry.ts`:

- `interface OpDefinition { name: string; description: string; kind: "query" | "command"; input: z.ZodType; handler: (input: never) => unknown }`
- `registerOp(op)` + `getOps(): ReadonlyMap<string, OpDefinition>`
- Правило ошибок: хендлеры возвращают `Result<T, AppError>` (слой
  `src/lib/server/*` уже так работает). Маппинг в HTTP-ошибки — на стороне
  remote-обёртки (существующий `unwrap()`), в MCP — на стороне тула
  (`isError: true` + текст). Один источник ошибок: `src/lib/server/errors.ts`.

### Шаг 3. Хелпер defineQuery/defineCommand (~15 мин)

Создать `src/lib/remote/define.ts`:

- `defineQuery(op)` → вызывает
  `query(op.input, input => unwrap(op.handler(input)))` из `$app/server` **и**
  `registerOp(op)`.
- `defineCommand(op)` — аналогично через `command`.
- Имя операции — в формате `tasks_create` (символы `[a-zA-Z0-9_-]`, без точек —
  безопасно для всех клиентов MCP).

### Шаг 4. Рефакторинг `*.remote.ts` (~20 мин)

Механический перенос, логика репозиториев не трогается:

1. `src/lib/remote/tasks.remote.ts` — 7 операций: `tasks_list`, `tasks_get`,
   `tasks_create`, `tasks_update`, `tasks_close`, `tasks_delete`, `tasks_move`.
2. `src/lib/remote/projects.remote.ts` — 4 операции: `projects_list`,
   `projects_get`, `projects_create`, `projects_update`.
3. `src/lib/remote/scopes.remote.ts` — 5 операций: `scopes_list`,
   `scopes_project_ids`, `scopes_create`, `scopes_update`, `scopes_delete`.

Итого 16 операций. У каждой — `description` на английском (её читает LLM).

Плюс barrel `src/lib/remote/index.ts`, импортирующий все три файла — чтобы
`/mcp` гарантированно видел полный реестр, даже если SvelteKit не подтянул
remote-модуль сам.

### Шаг 5. Эндпоинт `/mcp` (~30 мин)

`src/routes/mcp/+server.ts`:

```ts
import { createMcpHandler } from "mcp-handler";
import { getOps } from "#lib/remote/index.js";

const handler = createMcpHandler((server) => {
  for (const op of getOps().values()) {
    server.registerTool(
      op.name,
      { description: op.description, inputSchema: op.input },
      async (args) => {
        try {
          const value = await op.handler(args);
          return { content: [{ type: "text", text: JSON.stringify(value) }] };
        } catch (error) {
          return {
            content: [{ type: "text", text: String(error) }],
            isError: true,
          };
        }
      },
    );
  }
});

export { handler as GET, handler as POST };
```

(Точные типы подгоним по факту: `error()` из SvelteKit кидает `HttpError` —
распаковываем `.body.message`.)

### Шаг 6. Тесты (~20 мин)

- `src/lib/remote/registry.spec.ts`: после импорта barrel — ровно 16 операций,
  нет дублей имён, у каждой name/description/input.
- Smoke: реальный вызов
  `handler(new Request("http://localhost/mcp", { method: "POST", body: JSON-RPC initialize }))`
  и затем `tools/list` — в ответе все 16 тулов.

### Решение: токен не ставим

`/mcp` слушает `0.0.0.0:45881`, но сеть закрыта вторым роутером, доступа кроме
владельца нет — токен не нужен. Риск «сеть без аутентификации» уже принят в
`docs/deploy-plan.md`, и весь UI и так открыт по той же сети без аутентификации:
токен лишь на `/mcp` создал бы ложную иллюзию защиты. Если когда-нибудь
понадобится — обёртка на 5 строк (env `XBOCT_LOG_MCP_TOKEN` + проверка
`Authorization: Bearer`; Cline умеет custom headers в конфиге MCP).

### Шаг 7. Деплой (~10 мин)

По `docs/deploy-plan.md`: prod-рантайм сейчас импортирует снаружи только
`neverthrow` и `zod`. После шага 1 сюда добавятся `mcp-handler` и
`@modelcontextprotocol/server`:

- проверить, что `build/server/**` действительно тянет оба (grep по внешним
  импортам);
- `pnpm install --prod` в рантайме поставит их автоматически — они в
  `dependencies`;
- деплой через `scripts/deploy.ps1` как обычно.

### Шаг 8. Проверка (~10 мин)

1. `pnpm check && pnpm test && pnpm lint` — зелёные.
2. `pnpm dev` → `curl -X POST http://127.0.0.1:45881/mcp` с JSON-RPC
   `initialize` → 200.
3. Подключить клиент по URL `http://127.0.0.1:45881/mcp` → в списке тулов 16
   операций, вызвать `tasks_list` → вернулся список задач из БД.

## Открытые вопросы

- Формат ответа тула: сейчас `JSON.stringify` в текст — если клиенту неудобно,
  обернуть в markdown-блок.

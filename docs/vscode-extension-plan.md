# План: расширение VS Code как тонкий клиент

Как открыть бэклог во вкладке основного окна VS Code, не таща в расширение ни
SQLite, ни серверную логику.

## Итог, к которому идём

- Приложение остаётся **задеплоенным отдельно** (`docs/deploy-plan.md`): служба
  `xboct-log` под NSSM, `http://127.0.0.1:45881`, автозапуск при загрузке.
- Расширение — **тонкий клиент**: никакой БД, никакой копии `src/lib/server/*`.
  Оно открывает URL и держит вкладку.
- UI показывается **вкладкой в области редактора**, **без адресной строки**:
  кастомный `WebviewPanel` с `<iframe>` внутри.
- Новый REST API **не нужен**: приложение внутри iframe работает на своём
  origin, а remote functions шлют запросы туда же.

## Принятые решения

| #   | Вопрос                | Решение                                                  |
| --- | --------------------- | -------------------------------------------------------- |
| 1   | Где живёт БД и логика | На задеплоенном приложении, не в расширении              |
| 2   | Роль расширения       | Тонкий клиент: открыть и показать                        |
| 3   | Место UI              | Вкладка в области редактора (`WebviewPanel`)             |
| 4   | Адресная строка       | Нет (кастомный webview, не Simple Browser)               |
| 5   | Как отдаётся UI       | `<iframe src="http://127.0.0.1:45881">` внутри webview   |
| 6   | Связь с сервером      | HTTP напрямую, API не расширяем                          |
| 7   | Тема                  | Параметр `?theme=` при загрузке + `postMessage` на смену |

## Пути

| Что                 | Путь                                               |
| ------------------- | -------------------------------------------------- |
| Репозиторий         | `C:\+XBOCTuK\+life_projects\git-processes\backlog` |
| Прод-рантайм        | `C:\Users\Ku6epXBOCTuK\.xboct-log\app`             |
| Служба              | `xboct-log` (NSSM), порт `45881`                   |
| Код расширения      | `<repo>\vscode-extension`                          |
| Артефакт расширения | `<repo>\vscode-extension\xboct-log-0.0.2.vsix`     |

## Ключевые технические факты

- **Mixed content не мешает.** Webview живёт на `vscode-webview://` (secure
  context), а http-подфрейм оттуда обычно блокируется. Но `localhost` и
  `127.0.0.1` по спеке — potentially trustworthy origin, поэтому их http-iframe
  из secure-контекста разрешён. **Адрес обязан быть `127.0.0.1` или
  `localhost`**; LAN-IP (вида `http://192.168.x.x:45881`) будет заблокирован.
- **Сервер не запрещает фрейминг.** В `src/` нет ни `X-Frame-Options`, ни
  `frame-ancestors`, ни `Content-Security-Policy` (проверено грепом), а
  `adapter-node` их и не выставляет. Значит iframe загрузится.
- **Remote functions работают как есть.** Внутри iframe документ имеет origin
  `http://127.0.0.1:45881`, а его `POST`'ы идут на тот же origin. Проверку
  `Origin` у не-GET запросов закрывает `x-forwarded-proto: http` из
  `scripts/start-prod.mjs`.
- **Тема устроена на `color-scheme`.** В `src/app.css` значения идут через
  `light-dark(...)`, а `.theme-light` / `.theme-dark` просто переключают
  `color-scheme`. Класс вешается на `.app-shell` в `src/routes/+page.svelte`,
  поэтому проброс `?theme=dark` даёт нужную палитру без переписывания
  переменных.
- **Webview не наследует тему VS Code автоматически**: iframe кросс-доменный,
  `prefers-color-scheme` внутри него берётся от ОС, а не от темы редактора.
  Отсюда шаг 1.
- **Webview — это sandboxed iframe**: Node там нет. Обратно это не проблема,
  потому что расширению Node и не нужен — оно только открывает URL.

---

## Шаг 1. Правки в приложении (2 файла + 1 новый)

Нужны ровно две вещи: health-endpoint для проверки живости и приём темы.

### 1.1. `src/routes/api/health/+server.ts` (новый)

Простой маршрут, без remote function (`docs/plan.md` §5.4 предусматривал такой
вариант). Нужен, чтобы расширение отличало «служба лежит» от «служба отвечает»:
из webview кросс-доменный iframe не даёт надёжно поймать ошибку загрузки.

```ts
export function GET() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" },
  });
}
```

### 1.2. `src/lib/state/theme.svelte.ts`

- `createTheme()` принимает стартовое значение: `createTheme(initial)`.
- Добавляется `set(theme)` для смены темы без перезагрузки.
- Добавляется слушатель `window` `message`: по сообщению
  `{ type: "xboct-log:theme", theme: "light" | "dark" }` вызывается `set`.

Слушатель безвреден в обычном браузере и срабатывает только внутри webview.
Стартовое значение читается из URL на сервере, поэтому **первый кадр уже окрашен
правильно** — вспышки чужой темы нет.

### 1.3. `src/routes/+page.svelte`

Одна строка: `createTheme()` получает тему из
`page.url.searchParams.get("theme")`.

Важно: `setActiveProject()` переписывает URL через
`goto(..., { replace: true })`, но трогает **только** параметр `project`
(`url.searchParams.set/delete`), а `theme` остаётся. Значит переключение проекта
тему не сбрасывает.

## Шаг 2. Каркас расширения

Новая папка `<repo>\vscode-extension` со своим манифестом и своим
`tsconfig.json`. Корневой `tsconfig.json` включает только `src` и
`vite.config.ts`, поэтому код расширения он не проверяет — конфликта с
`pnpm check` нет.

Сам `tsconfig.json` расширения: `module: "node16"` и явный
`types: ["node", "vscode"]`. Без первого не резолвится `node:crypto`, без
второго не подхватывается `@types/node` (а в нём — глобальный `URL`), и `tsc`
падает на обоих. При `"type": "commonjs"` в манифесте расширения
`module: "node16"` по-прежнему компилирует в CommonJS, как требует `main`.

`package.json` (манифест расширения), ключевое:

- `"main": "./out/extension.js"`, `"engines": { "vscode": "^1.90.0" }`
- `publisher` обязателен, иначе `vsce package` падает
- `contributes.commands`:
  - `xboctLog.open` — «Xboct Log: Open Board»
  - `xboctLog.reload` — «Xboct Log: Reload»
- `contributes.menus` → `view/title`: кнопка `xboctLog.reload` в заголовке
  вкладки, `when: activeWebviewPanelId == xboctLog`
- `contributes.configuration` → `xboctLog.serverUrl`, default
  `http://127.0.0.1:45881`
- `contributes.viewsContainers.activitybar` → иконка `media/icon.svg` в левой
  панели, `contributes.views` → вид `xboctLog.board` (тоже с `icon`),
  `contributes.viewsWelcome` → содержимое вида со ссылкой
  `[Открыть борд](command:xboctLog.open)`. Провайдер вида не нужен: VS Code сам
  рисует welcome-контент у вида без источника данных.
- `media/icon.svg` — монохромная копия геометрии
  `src/lib/components/layout/BrandMark.svelte` (три скруглённые полосы шириной
  18, 13 и 9). Акцентный цвет `BrandMark` не переносится: activity bar рисует
  иконку одним цветом темы.
- `activationEvents`: только `onWebviewPanel:xboctLog` (для восстановления
  вкладки). События для команд и видов объявлять не нужно — с VS Code 1.74 они
  генерируются автоматически из `contributes`, а лишние строки редактор помечает
  подсказкой.

Зависимости (все в `devDependencies`, рантайм-зависимостей нет):
`@types/vscode`, `@types/node`, `typescript`, `@vscode/vsce`.

### Иконка в левой панели

Клик по иконке в activity bar всегда разворачивает контейнер в сайдбаре —
заставить её открыть вкладку редактора нельзя. Поэтому вид `xboctLog.board`
показывает одну ссылку-кнопку «Открыть борд», а сам борд по-прежнему живёт в
широкой вкладке редактора. Так приложение остаётся в единственном экземпляре:
сайдбар — только точка входа.

## Шаг 3. `WebviewPanel` с iframe

Создание панели (синглтон: повторный вызов раскрывает уже открытую):

```ts
vscode.window.createWebviewPanel(
  "xboctLog",
  "Xboct Log",
  vscode.ViewColumn.One,
  {
    enableScripts: true,
    retainContextWhenHidden: true,
  },
);
```

`retainContextWhenHidden: true` обязателен: состояние борда живёт внутри SPA, и
без этого переключение на другую вкладку редактора перезагружает приложение.

CSP страницы-обёртки (скриптов у нас почти нет, нужен nonce):

```txt
default-src 'none'; frame-src http://127.0.0.1:45881; script-src 'nonce-<n>'; style-src 'unsafe-inline'
```

Разметка обёртки: `<iframe>` на всю высоту плюс крошечный скрипт-мост.

Скрипт-мост делает две вещи:

1. Принимает от extension host `{ type: "xboct-log:theme", theme }` и пересылает
   его в iframe через `frame.contentWindow.postMessage(data, "*")`. Внутри
   приложения это ловит слушатель из шага 1.2 — **без перезагрузки**.
2. Принимает `{ type: "xboct-log:reload" }` и переустанавливает `frame.src` с
   параметром-обнулителем кэша (`&_=<timestamp>`): без него повторная установка
   того же URL не вызывает навигацию.

Начальная тема зашивается в сам `src` (`?theme=light|dark`), чтобы не было
вспышки. `targetOrigin: "*"` здесь безопасен: адресат только `127.0.0.1`.

Тему VS Code расширение читает из `vscode.window.activeColorTheme.kind`
(`Light`/`HighContrastLight` → `light`, остальное → `dark`) и подписывается на
`onDidChangeActiveColorTheme`.

## Шаг 4. Проверка живости, релоад, восстановление

- **Перед открытием** —
  `fetch("<serverUrl>/api/health", { signal: AbortSignal.timeout(1500) })`.
  Лежит → открываем панель с HTML-страницей «служба `xboct-log` не отвечает,
  запустите `nssm start xboct-log`» на переменных `--vscode-*`; поднят → iframe.
- **Офлайн-страница умеет перепроверяться.** Кнопка «Проверить снова» и кнопка
  Reload в заголовке вкладки шлют из webview `{ type: "xboct-log:retry" }`,
  расширение повторяет health-запрос и перерисовывает `webview.html`. Без этого
  был бы тупик: у офлайн-страницы нет моста к iframe, и Reload в заголовке
  ничего бы не делал.
- **`xboctLog.reload`** шлёт `{ type: "xboct-log:reload" }` в webview. На борде
  это переустанавливает `iframe.src`, на офлайн-странице — перепроверка живости.
- **`registerWebviewPanelSerializer`** восстанавливает вкладку после рестарта VS
  Code (парная настройка — `activationEvents: ["onWebviewPanel:xboctLog"]`).
  Восстановленной панели нужно заново выставить
  `webview.options = { enableScripts: true }`: при восстановлении опции не
  переносятся, и без этого скрипт-мост не запустится.
- **Статусбар** (опционально): элемент со счётчиком открытых задач. Требует
  обращения к данным, то есть REST API, — поэтому в базовый объём не входит.

## Шаг 5. Гигиена репозитория

Корневой `pnpm lint` гоняет `prettier --check . && eslint .` по всему дереву,
поэтому исключаем только сгенерированное.

- `.gitignore` (корень): добавить `/vscode-extension/node_modules`,
  `/vscode-extension/out`, `*.vsix`.
- `.prettierignore` (корень): **ничего добавлять не нужно** — код расширения
  форматируется корневым Prettier (табы, 80 колонок, двойные кавычки).
- `eslint.config.js` (корень): добавить блок
  `{ ignores: ["vscode-extension/out/**"] }`.

Исходники расширения **не изолируются** от корневых Prettier и ESLint: это наш
код на нашем стеке, и корневой конфиг проверяет его без ошибок (`out/` исключён
как сгенерированный, `node_modules` — через `includeIgnoreFile`). Отдельным
остаётся только `tsconfig.json`: корневой собран под `$app/tsconfig`, ESM и
бандлер, а расширение компилируется в commonjs под Node, поэтому `pnpm check`
его не типизирует, и за типы отвечает `tsc -p .` внутри `vscode-extension`.

## Шаг 6. Сборка и установка

`vscode-extension/package.json`:

```json
"scripts": {
  "compile": "tsc -p .",
  "watch": "tsc -p . -w",
  "package": "vsce package"
}
```

Сборка — обычным `tsc` в `out/`: рантайм-зависимостей нет, бандлер не нужен.

Цикл разработки: открыть папку `vscode-extension` в VS Code как отдельный
проект, `F5` (нужен `.vscode/launch.json` внутри неё) поднимает Extension
Development Host.

Установка: `code --install-extension vscode-extension\xboct-log-0.0.2.vsix`,
затем Reload Window.

## Шаг 7. Проверка

1. `pnpm run deploy` → `nssm status xboct-log` = `SERVICE_RUNNING`;
   `http://127.0.0.1:45881/api/health` отдаёт `{"ok":true}`.
2. `cd vscode-extension` → `npm install` → `npm run compile` → `npm run package`
   → появляется `.vsix`.
3. Установить `.vsix`, Reload Window.
4. `Ctrl+Shift+P` → «Xboct Log: Open Board» → вкладка в области редактора, **без
   адресной строки**.
5. Сменить тему VS Code → приложение переключается на ходу, вкладка не
   перезагружается и состояние борда сохраняется.
6. Остановить службу (`nssm stop xboct-log`) → «Open Board» показывает страницу
   с инструкцией, а не пустой фрейм.
7. Перезапустить VS Code → вкладка восстанавливается.

---

## Риски и примечания

- **Только localhost.** Схема со вложенным iframe работает для `127.0.0.1` и
  `localhost`. Обращение к прод-адресу по LAN-IP из webview заблокируется как
  mixed content. Прод при этом по-прежнему слушает `0.0.0.0:45881`.
- **Сеть без аутентификации.** В приложении входа нет (`docs/plan.md`: «один
  пользователь, одна машина»), а прод открыт на `0.0.0.0`. Расширение этого не
  ухудшает. Минимизация — правило Windows Firewall (уже отмечено в
  `docs/deploy-plan.md`).
- **Тема не наследуется, а пробрасывается.** Параметр `?theme=` задаёт стартовое
  значение, `postMessage` — последующие смены. Если эту связку убрать,
  приложение будет слушать `prefers-color-scheme` ОС и разойдётся с темой
  редактора.
- **`retainContextWhenHidden` держит webview в памяти**, пока вкладка открыта.
  Для SPA с фильтрами это оправданная плата, но помнить о ней стоит.
- **Нативных команд нет.** «Создать задачу из выделения» (`docs/plan.md` §10) в
  этот объём не входит: без REST API расширение не видит данные. Это отдельный
  этап.
- **Порт зашит в настройку.** Смена прод-порта требует правки
  `xboctLog.serverUrl` в настройках VS Code.
- **`vsce package` требует `publisher`** в манифесте; без него упаковка падает.

## Отложено: REST API и нативные команды

Если позже понадобятся «создать задачу из выделения», QuickPick по задачам или
счётчик в статусбаре, потребуется настоящий REST API на задеплоенном приложении
(`src/routes/api/**/+server.ts` поверх готовых функций `src/lib/server/*`,
которые уже возвращают `Result`). Это отдельная задача: расширение тогда
перестаёт быть чистым средством просмотра и начинает ходить в API, что тянет за
собой токен и CORS.

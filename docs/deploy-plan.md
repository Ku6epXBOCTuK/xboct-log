# План: prod-развёртывание и изоляция dev

Пошаговый план того, как поднять постоянно работающий prod, обновлять его одной
командой и не дать dev-версии (и тестам) испортить реальные данные.

## Итог, к которому идём

- **Prod** — это **артефакт** в `~/.xboct-log/app`, вне git. Порт `45881`,
  доступ по сети.
- **Сборка** для prod делается в **транзитном git worktree на `origin/main`**, а
  не в рабочей папке.
- **Dev** работает отдельно: на **клоне прод-базы**, с **выключенными
  бэкапами**.
- **Bun** — отложен: в Bun нет `node:sqlite`, на котором держится слой БД
  (`src/lib/server/db.ts`, `backup.ts`).

## Принятые решения

| #   | Вопрос               | Решение                                             |
| --- | -------------------- | --------------------------------------------------- |
| 1   | Хостинг prod         | NSSM (Windows-служба, авто-рестарт, логи)           |
| 2   | Bun                  | Отложить (блокер `node:sqlite`)                     |
| 3   | Порт / доступ        | `45881`, `HOST=0.0.0.0` (по сети)                   |
| 4   | Источник dev-данных  | Клон **живой** прод-БД                              |
| 5   | Формат автоматизации | Файлы скриптов разрешены (`scripts/*.mjs`, `*.ps1`) |
| 6   | Где prod             | `~/.xboct-log/app`, без git                         |
| 7   | Откуда сборка        | Транзитный worktree на `origin/main`                |

## Пути

| Что               | Путь                                               |
| ----------------- | -------------------------------------------------- |
| Репозиторий (dev) | `C:\+XBOCTuK\+life_projects\git-processes\backlog` |
| Прод-рантайм      | `C:\Users\Ku6epXBOCTuK\.xboct-log\app`             |
| Прод-БД           | `C:\Users\Ku6epXBOCTuK\.xboct-log\xboct-log.db`    |
| Dev-БД            | `C:\Users\Ku6epXBOCTuK\.xboct-log\dev.db`          |
| Бэкапы prod       | `C:\Users\Ku6epXBOCTuK\.xboct-log\backups`         |
| Бэкапы dev        | `C:\Users\Ku6epXBOCTuK\.xboct-log\dev-backups`     |
| Логи службы       | `C:\Users\Ku6epXBOCTuK\.xboct-log\app\logs`        |
| Служба            | `xboct-log` (NSSM)                                 |

## Ключевой технический факт

Собранный `build/server/**` импортирует наружу ровно два модуля: `neverthrow` и
`zod`. Всё остальное (рантайм SvelteKit, адаптер) уже внутри билда. Значит
прод-папке нужен **маленький `node_modules`** с этими двумя пакетами — и только
он. Node резолвит их из `app/node_modules`, поднимаясь от
`app/build/server/chunks/*.js` вверх.

Подтверждено на живой сборке `origin/main`: внешние импорты в `build/server/**`
— ровно `neverthrow` и `zod`. Чтобы `pnpm install --prod` поставил **только**
их, `@iconify-json/lucide` и `unplugin-icons` должны лежать в `devDependencies`
(они нужны лишь на сборке). Иначе прод тянет 4 топ-пакета и ~210 всего. Правка
внесена (`chore: update deps`); на прод она попадает только после пуша в
`origin/main`.

---

## Шаг 1. Прод-рантайм-папка

Создать `~/.xboct-log/app` со структурой:

```txt
app/
  build/         ← артефакт (копируется деплоем)
  node_modules/  ← only neverthrow + zod
  package.json   ← манифест для этих зависимостей
  pnpm-lock.yaml ← для --frozen-lockfile
  start.mjs      ← launcher (копируется деплоем)
  version.txt    ← хэш коммита + время сборки
  logs/          ← stdout/stderr службы
```

Прод-зависимости ставятся один раз и обновляются деплоем:

```powershell
Copy-Item package.json, pnpm-lock.yaml "$env:USERPROFILE\.xboct-log\app\" -Force
Push-Location "$env:USERPROFILE\.xboct-log\app"
pnpm install --prod --frozen-lockfile
Pop-Location
```

## Шаг 2. Launcher `scripts/start-prod.mjs`

Единый источник правды по env для prod. NSSM вызывает именно его.

```js
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

process.env.PORT ??= "45881";
process.env.HOST ??= "0.0.0.0";
process.env.XBOCT_LOG_DB ??= join(homedir(), ".xboct-log", "xboct-log.db");

const entry = join(import.meta.dirname, "build", "index.js");
await import(pathToFileURL(entry).href);
```

`ORIGIN` не обязателен: при доступе по тому же адресу SvelteKit видит
совпадающий `Origin`. Выставлять `ORIGIN` нужно только за прокси.

## Шаг 3. Служба NSSM

Установка (однократно, путь к node — из `(Get-Command node).Source`):

```powershell
$node = (Get-Command node).Source
$app  = "$env:USERPROFILE\.xboct-log\app"

nssm install xboct-log $node "$app\start.mjs"
nssm set xboct-log AppDirectory $app
nssm set xboct-log AppEnvironmentExtra "XBOCT_LOG_DB=$env:USERPROFILE\.xboct-log\xboct-log.db"
nssm set xboct-log AppStdout    "$app\logs\out.log"
nssm set xboct-log AppStderr    "$app\logs\err.log"
nssm set xboct-log AppRotateFiles 1
nssm set xboct-log AppRotateBytes 1048576
nssm set xboct-log Start SERVICE_AUTO_START
```

`AppEnvironmentExtra` обязателен: служба под nssm стартует как `LocalSystem`, а
под ним `homedir()` в Node = `C:\Windows\system32\config\systemprofile`. Без
явного `XBOCT_LOG_DB` бэклог ушёл бы в системный профиль. С выставленной
переменной `??=` в launcher её не перезапишет, а `backups` выведется из
`dirname(db)`.

`nssm start xboct-log` — **не** здесь, а после первого деплоя (шаг 4): пока
`app\build` пуст, служба уйдёт в crash-loop.

Установка nssm: `choco install nssm -y` (манифест scoop битый — тянет мёртвый
`nssm.cc/ci/*`).

Проверка и перезапуск: `nssm status xboct-log`, `nssm restart xboct-log`.

Права на управление службой без elevation (однократно, из elevated PowerShell):

```powershell
sc.exe sdset xboct-log "D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCLCSWRPWPDTLOCRRC;;;IU)(A;;CCLCSWRPWPDTLOCRRC;;;SU)"
```

По умолчанию `IU`/`SU` получают только чтение статуса; `CCLCSWRPWPDTLOCRRC`
добавляет `RP` (start) и `WP` (stop), после чего `deploy.ps1` идёт без admin.

## Шаг 4. `scripts/deploy.ps1`

Сборка на `origin/main` в транзитном worktree, копирование артефакта, рестарт.

```powershell
$ErrorActionPreference = "Stop"

$Repo    = "C:\+XBOCTuK\+life_projects\git-processes\backlog"
$AppDir  = Join-Path $env:USERPROFILE ".xboct-log\app"
$Service = "xboct-log"
$Temp    = Join-Path $env:TEMP ("xboct-log-build-" + [guid]::NewGuid().ToString("N"))

git -C $Repo fetch origin
git -C $Repo worktree add --detach $Temp origin/main
try {
  Push-Location $Temp
  pnpm install --frozen-lockfile
  pnpm build
  Pop-Location

  New-Item -ItemType Directory -Force $AppDir | Out-Null
  New-Item -ItemType Directory -Force (Join-Path $AppDir "logs") | Out-Null
  Copy-Item (Join-Path $Temp "package.json"), (Join-Path $Temp "pnpm-lock.yaml") $AppDir -Force
  Copy-Item (Join-Path $Repo "scripts\start-prod.mjs") (Join-Path $AppDir "start.mjs") -Force

  Push-Location $AppDir
  pnpm install --prod --frozen-lockfile
  Pop-Location

  nssm stop $Service
  $rc = (robocopy (Join-Path $Temp "build") (Join-Path $AppDir "build") /MIR /NFL /NDL /NJH /NJS)
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE)" }

  $head = git -C $Temp rev-parse HEAD
  "$head  $(Get-Date -Format o)" | Set-Content (Join-Path $AppDir "version.txt")

  nssm start $Service
}
finally {
  if (Test-Path $Temp) { git -C $Repo worktree remove $Temp --force }
}
```

Порядок важен: `pnpm install --prod` идёт **до** остановки службы (простой
только на время `robocopy` + рестарт). `robocopy` возвращает коды `0..7` как
успех — ошибкой считается `>= 8`.

Скрипт запускается из **обычного** PowerShell: права на `nssm stop`/`nssm start`
выданы пользователю через DACL службы (см. шаг 3).

### Отличия фактической реализации

Полный скрипт — `scripts/deploy.ps1`. К наброску выше добавлено:

- свип `%TEMP%\xboct-log-build-*` на старте;
- проверка `build\index.js` до `robocopy` (не перетирать прод пустым билдом);
- best-effort уборка worktree с ретраями;
- ожидание `SERVICE_RUNNING` после `nssm start`.

`git worktree remove --force` может не удалить каталог: native-модуль
(`rolldown-binding.*.node`) на время держит фильтр файловой системы. Регистрация
worktree при этом снимается корректно (`git worktree list` чист), а каталог
подчищает свип при следующем deploy.

Почему так безопасно: прод читает `~/.xboct-log/app/build`, а `pnpm build` в
рабочей папке пишет в `backlog\build`. Случайная сборка физически не попадает на
прод — она меняется **только** когда запущен `deploy.ps1`.

## Шаг 5. Dev: клон живой БД + launcher

### `scripts/dev-clone.mjs`

Копия прод-БД в `dev.db` через `backup()` из `node:sqlite` — тот же примитив,
что уже используется в `src/lib/server/backup.ts`. Безопасно при включённом WAL
и при работающем prod.

```js
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, backup } from "node:sqlite";

const root = join(homedir(), ".xboct-log");
const prod = process.env.XBOCT_LOG_PROD_DB ?? join(root, "xboct-log.db");
const dev = process.env.XBOCT_LOG_DB ?? join(root, "dev.db");

if (!existsSync(prod)) {
  console.error(`prod database not found: ${prod}`);
  process.exit(1);
}

const source = new DatabaseSync(prod, { readOnly: true });
try {
  await backup(source, dev);
} finally {
  source.close();
}
console.log(`cloned ${prod} -> ${dev}`);
```

Если открытие `readOnly` на живом WAL даст ошибку — открывать без `readOnly`.

### `scripts/dev.mjs`

Запускает `vite dev` с изолированным окружением: dev-БД, выключенные бэкапы и
**отдельный каталог бэкапов**. Каталог — не лишний: он страхует на случай, если
флаг `XBOCT_LOG_BACKUP_DISABLED` когда-нибудь забудут выставить (например,
запустят `pnpm dev:vite` вручную). Тогда бэкапы уйдут в `dev-backups`, а не
перезапишут прод-файл `xboct-log-YYYY-MM-DD.db` в общем каталоге.

```js
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const root = join(homedir(), ".xboct-log");
const env = {
  ...process.env,
  XBOCT_LOG_DB: process.env.XBOCT_LOG_DB ?? join(root, "dev.db"),
  XBOCT_LOG_BACKUP_DIR:
    process.env.XBOCT_LOG_BACKUP_DIR ?? join(root, "dev-backups"),
  XBOCT_LOG_BACKUP_DISABLED: "1",
};

const child = spawn("pnpm", ["exec", "vite", "dev", "--port", "5173"], {
  stdio: "inherit",
  env,
  shell: true,
});
child.on("exit", (code) => process.exit(code ?? 0));
```

Рабочий цикл: `pnpm dev:clone` → `pnpm dev` → ломаешь данные как угодно →
`pnpm dev:clone` снова для чистой копии.

## Шаг 6. Скрипты в `package.json`

```json
"deploy": "powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1",
"dev": "node scripts/dev.mjs",
"dev:vite": "vite dev",
"dev:clone": "node scripts/dev-clone.mjs"
```

`dev` заменяется на launcher, чтобы dev **по умолчанию** шёл на клон и не трогал
прод. `dev:vite` остаётся для сырого запуска без изоляции.

Скрипт `start` не заводим: prod поднимает NSSM (`nssm start xboct-log`), а файл
launcher'а в проде называется `start.mjs` (deploy копирует
`scripts/start-prod.mjs` в `app\start.mjs`), так что одноимённому npm-скрипту
нет применения.

Запускать деплой — через `pnpm run deploy`, а **не** `pnpm deploy`: `deploy` —
встроенная команда pnpm, она перехватывает имя и падает с
`ERR_PNPM_INVALID_DEPLOY_TARGET`.

## Шаг 7. Проверка

1. `pnpm dev:clone` — появился `dev.db`.
2. `pnpm dev` — открывается `http://localhost:5173`, в каталоге
   `~/.xboct-log\backups` ничего не меняется.
3. `pnpm run deploy` — `nssm status xboct-log` = `SERVICE_RUNNING`,
   `app\version.txt` содержит свежий хэш.
4. `http://localhost:45881` — прод открывается; с другой машины в сети — по
   `http://<IP>:45881`.
5. Перезагрузка — служба поднялась сама.

---

## Риски и примечания

- **Сеть без аутентификации.** В `docs/plan.md` явно «один пользователь, одна
  машина», входа в приложении нет. `0.0.0.0:45881` откроет бэклог всей локалке.
  Минимизация: правило Windows Firewall на конкретную подсеть/IP.
- **Dev-бэкапы.** `backupConfig()` берёт каталог из `dirname(defaultDbPath())`,
  а имя файла `xboct-log-YYYY-MM-DD.db` совпадает с прод-бэкапом. Если dev
  пойдёт на той же папке бэкапов, он **перезапишет** прод-бэкап за сегодня.
  Поэтому в dev — двойная защита: `XBOCT_LOG_BACKUP_DISABLED=1` плюс отдельный
  `XBOCT_LOG_BACKUP_DIR=~/.xboct-log/dev-backups`. Второй срабатывает даже если
  флаг забыт (ручной запуск `pnpm dev:vite`), и бэкапы всё равно не пересекутся
  с прод-каталогом.
- **`node_modules` на проде.** Сборка требует `neverthrow` и `zod` в
  `app/node_modules`; без них сервер упадёт на импорте. Ставится шагом 1 и
  обновляется деплоем.
- **Node ≥ 22.5** из-за `node:sqlite` (на машине стоит 24.13.0).
- **Простой при деплое** = время `robocopy` + рестарт, порядка 2–3 секунд.
- **`ORIGIN`** нужен только если появится реверс-прокси.
- **Deploy без admin.** `nssm stop`/`nssm start` работают из обычного
  PowerShell: DACL службы `xboct-log` даёт `IU`/`SU` права `RP`/`WP`
  (start/stop). Выдано однократно через `sc.exe sdset` (шаг 3).
- **Temp-worktree и блокировка файлов.** `git worktree remove --force` иногда не
  может удалить каталог сборки; в `%TEMP%` остаётся мусор, который подчищает
  свип на старте следующего deploy. Регистрация worktree не течёт.
- **Прод-`node_modules`.** Прод ставит ровно `neverthrow` + `zod`, только если
  `@iconify-json/lucide` и `unplugin-icons` в `devDependencies` **и** эта правка
  есть в `origin/main`. Пока не запушено — deploy вернёт в app полный
  `package.json` и ~210 пакетов.

## Отложено: prod на Bun

Причина блокировки — `node:sqlite` в Bun не реализован (нужен переход на
`bun:sqlite`, другой API, `backup()` → `VACUUM INTO`). Возвращаться к вопросу
только после замера RSS текущего Node-сервера: если он и так невелик, экономия
не оправдывает рефактор слоя БД.

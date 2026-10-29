# Xboct Log для VS Code

Открывает борд `xboct-log` во вкладке области редактора и сам запускает
локальный сервер, если он не отвечает.

## Установка сервера

Нужен один из вариантов:

- установщик `xboct-log-<version>-win-x64-setup.exe` из
  [релизов](https://github.com/Ku6epXBOCTuK/xboct-log/releases);
- `npm install -g xboct-log`.

Расширение ищет `xboct-log` по пути из настройки `xboctLog.serverPath`, затем в
`%LOCALAPPDATA%\Programs\Xboct Log`, затем в `PATH`.

## Команды

- `Xboct Log: Open Board`
- `Xboct Log: Start Server`
- `Xboct Log: Reload`

## Настройки

- `xboctLog.serverUrl` — адрес приложения, по умолчанию
  `http://127.0.0.1:45881`.
- `xboctLog.autoStart` — запускать сервер при открытии борда, по умолчанию
  включено.
- `xboctLog.serverPath` — путь к `xboct-log.cmd` или команда запуска.
- `xboctLog.dataDir` — папка данных для запускаемого сервера.

## Сборка

```sh
npm install
npm run compile
npm run package
```

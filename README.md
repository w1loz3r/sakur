# Sakura Launcher 0.2.0

Sakura Launcher — собственный Minecraft Java launcher на Tauri 2 + React + Rust. Это не копия интерфейса Millida: отдельный UI, бренд и структура проекта.

## Что реально работает в этой версии

- первый запуск с обязательным выбором локального ника;
- сохранение профиля и сборок между запусками;
- вкладка «Серверы» удалена;
- «Мои сборки» показывает только сборки, созданные пользователем — никаких захардкоженных карточек;
- реальные версии Minecraft Java берутся из официального Mojang version manifest;
- создание сборки из конкретной версии автоматически добавляет её в «Мои сборки»;
- установка Vanilla client: загрузка version metadata и client JAR в отдельную папку выбранной сборки;
- поиск модов через публичный Modrinth API;
- установка совместимого файла мода в `instances/<build>/mods`;
- отдельные папки экземпляров для сборок;
- Tauri/Rust backend с безопасным ограниченным скачиванием файлов внутри папки приложения;
- сохранённый пользовательский pixel-art icon;
- Windows NSIS bundle через GitHub Actions.

## Важно

Это уже не статический макет, но это ещё не законченный production Minecraft launcher. В частности, Microsoft OAuth, Java runtime manager, полноценный classpath/assets/natives launcher и Fabric/Forge/NeoForge/Quilt installers требуют следующего этапа ядра.

Автономный профиль — это локальный ник для интерфейса и локальных данных. Он не заменяет Microsoft-авторизацию и не обходит владение Minecraft.

## Запуск

```bash
npm install
npm run dev
```

Для Tauri:

```bash
npm run tauri dev
```

Сборка Windows:

```bash
npm run tauri build
```

Проект использует папку `src-taurin/` для Rust/Tauri backend — это сделано специально и соответствует текущему репозиторию.

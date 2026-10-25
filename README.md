# PinPage 2.0 — React + TypeScript + Vite + Supabase

Личная страница-«стена» (текст, картинки, видео, музыка), друзья, личные сообщения, админ-панель.

## Первый запуск сервера (один раз)

Вся серверная часть — в папке [`sql/`](sql). Выполняй файлы в **Supabase → SQL Editor** по порядку
(перед этим сделай бэкап: Database → Backups):

| Шаг | Файл | Что делает |
|---|---|---|
| 1 | `sql/01_setup.sql` | таблицы, сессии, закрытое хранилище паролей, все функции `pp_*`. Только добавляет — старый сайт пока работает |
| 2 | выложи новый код сайта (см. ниже) | |
| 3 | `sql/02_lockdown.sql` | закрывает прямой доступ к таблицам: читать публичное можно, менять и читать личное — только через функции |
| 4 | `sql/03_storage.sql` | лимит размера и разрешённые типы файлов в бакете `media` |
| 5 | `sql/99_verify.sql` | самопроверка: должно появиться «ВСЕ ПРОВЕРКИ ПРОШЛИ» (в базе ничего не остаётся) |

Подробнее о модели защиты — в [SECURITY.md](SECURITY.md). Пароли хранятся как есть, но в закрытой таблице
`user_secrets`; смотреть их можно только в Supabase Dashboard → Table Editor.

## Как запустить сайт на GitHub Pages

1. Загрузи **содержимое этой папки** в корень репозитория (чтобы `package.json` лежал в корне,
   рядом — `src`, `public`, `.github`).
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Запушь в `main` — сборка и публикация пойдут автоматически (вкладка **Actions**). Сайт появится на
   `https://<ник>.github.io/<репозиторий>/`. Перед сборкой воркфлоу проверяет типы и гоняет тесты.

> Из репозитория **удали** файлы, которых нет в этой версии (список — в `CHANGES.md`, раздел «Удалить»).

## Локальная разработка

```bash
npm install
npm run dev         # http://localhost:5173
npm test            # тесты (vitest + jsdom, на фейковой базе — в сеть не ходят)
npm run typecheck   # проверка типов
npm run build       # продакшн-сборка в dist/
```

По умолчанию сайт работает с боевой базой из `src/supabase.ts`. Для разработки лучше завести
**отдельный тестовый проект Supabase**, прогнать в нём `sql/01…03` и указать его в `.env`
(см. `.env.example`). Тогда и `npm run e2e` не будет создавать пользователей в боевой базе.

## Уборка хранилища

Файлы удалённых блоков, сообщений и аккаунтов остаются в Storage. Раз в какое-то время запускай
(у себя на компьютере, нужен `service_role`-ключ — **не клади его в репозиторий**):

```bash
SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_KEY=... npm run purge-media            # показать лишнее
SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_KEY=... npm run purge-media -- --delete # удалить
```

## Структура

```
sql/                   01_setup, 02_lockdown, 03_storage, 99_verify — серверная часть
scripts/               e2e.mjs (Chrome), purge-orphan-media.mjs (уборка Storage)
public/                иконки и manifest.webmanifest
src/
  supabase.ts          слой данных: вызовы pp_*-функций, чтения с проверкой ошибок, загрузка файлов
  types.ts             все интерфейсы
  context/AppContext   состояние: пользователь, вкладка, тема, уведомления
  hooks/               сессия (токен, пульс 30 с, бан, предупреждения), «играет одно медиа»
  lib/                 pickFile, fileKinds (разрешённые типы), safe (безопасный цвет), format
  components/          Auth, Nav, Wall/*, Friends/*, Settings, Changelog, Admin/*, ErrorBoundary
  styles/global.css    дизайн-система (OKLCH, @layer, container queries)
```

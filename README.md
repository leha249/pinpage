# PinPage 2.0 — React + TypeScript + Vite

## Как запустить сайт на GitHub Pages (один раз)

1. Создай репозиторий и загрузи **содержимое этой папки** в его корень
   (чтобы `package.json` лежал в корне, а рядом — папки `src` и `.github`).
2. В репозитории: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Запушь в ветку `main` — сборка и публикация пойдут автоматически
   (вкладка **Actions** покажет прогресс). Сайт появится на
   `https://<ник>.github.io/<репозиторий>/`.

Руками ничего собирать не нужно — это делает `.github/workflows/deploy.yml`.

> Старые файлы `index.html`, `style.css`, `db.js`, `app.js` из прошлой версии
> из репозитория **удали**, иначе они будут конфликтовать с новым `index.html`.

## Локальная разработка (по желанию)

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # дымовые тесты
npm run build    # продакшн-сборка в dist/
```

## Структура

```
src/
  supabase.ts          типизированный слой данных (вся работа с БД и Storage)
  types.ts             все интерфейсы
  context/AppContext   состояние: пользователь, вкладка, тема, уведомления
  hooks/               сессия, пульс «в сети», realtime; регистр «играет одно медиа»
  components/          Auth, Nav, Wall/*, Friends/*, Settings, Changelog, Admin/*
  styles/global.css    дизайн-система (OKLCH, @layer, container queries)
```

## База данных

SQL-скрипты прошлых версий остаются в силе (таблицы, политики, views).
Если ещё не выполнял `fix_delete_user.sql` — выполни, иначе удаление
пользователей в админке не сработает.

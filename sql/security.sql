-- ═══════════════════════════════════════════════════════════════════════
-- PinPage — миграция безопасности: Row Level Security + Supabase Auth.
--
-- ВАЖНО. Это миграция, а не просто «выполнить и забыть». Она переводит
-- приложение с «все ходят по одному anon-ключу» на модель, где каждый
-- запрос несёт JWT (auth.uid()), а политики RLS решают, что кому можно.
-- Выполняй по фазам и проверяй после каждой. Перед запуском сделай бэкап.
--
-- Текущее состояние (до миграции):
--   * клиент использует только публичный anon-ключ;
--   * пароли хранятся в public.users и доступны анониму (для входа);
--   * любой с anon-ключом может читать и менять чужие данные.
--
-- Целевое состояние (после миграции):
--   * вход через Supabase Auth (email + пароль, bcrypt на сервере);
--   * public.users = профиль без пароля, привязан к auth.users.id;
--   * RLS ограничивает чтение/запись владельцем или ролью admin.
-- ═══════════════════════════════════════════════════════════════════════

-- ═══ ФАЗА 1. Связать профили с auth.users ══════════════════════════════

-- 1.1 Добавляем колонку id (uuid) и заполняем у существующих пользователей.
--     Соответствие auth.users.id <-> username удобнее всего сделать скриптом
--     на сервере (service_role), который для каждого username создаёт
--     auth-пользователя и возвращает его id. Здесь — каркас.
alter table public.users
  add column if not exists id uuid;

-- 1.2 Делаем id уникальным первичным ключом, username остаётся уникальным индексом.
--     (Выполняется после того, как у всех строк проставлен корректный id.)
-- alter table public.users
--   add constraint users_pk primary key (id);
create unique index if not exists users_username_key on public.users (lower(username));

-- 1.3 Включаем RLS на всех таблицах.
alter table public.users           enable row level security;
alter table public.walls           enable row level security;
alter table public.friendships     enable row level security;
alter table public.messages        enable row level security;
alter table public.bans            enable row level security;
alter table public.warnings        enable row level security;
alter table public.block_reactions enable row level security;
alter table public.changelog       enable row level security;
alter table public.media           enable row level security;

-- ═══ ФАЗА 2. Скрыть пароль из public.users ══════════════════════════════
-- Пароль больше НЕ должен лежать в профильной таблице. Новый пароль хранит
-- Supabase Auth (bcrypt). Старую колонку password можно удалить после того,
-- как все аккаунты переведены на Auth:
-- alter table public.users drop column if exists password;

-- ═══ ФАЗА 3. Политики RLS ═══════════════════════════════════════════════
-- Профили видны всем (имя, аватар, bio, цвет), но менять может только владелец.

drop policy if exists users_select on public.users;
create policy users_select on public.users for select using (true);

drop policy if exists users_update on public.users;
create policy users_update on public.users for update using (auth.uid() = id);

drop policy if exists users_insert on public.users;
create policy users_insert on public.users for insert with check (auth.uid() = id);

-- Стены: читать можно всем, писать — только владельцу стены.
drop policy if exists walls_select on public.walls;
create policy walls_select on public.walls for select using (true);

drop policy if exists walls_upsert on public.walls;
create policy walls_upsert on public.walls for insert with check (auth.uid() = (select id from public.users where username = walls.username));
-- для update аналогично:
drop policy if exists walls_update on public.walls;
create policy walls_update on public.walls for update using (auth.uid() = (select id from public.users where username = walls.username));

-- Дружба: строки вида (username -> friend_username). Владелец — username.
drop policy if exists friendships_select on public.friendships;
create policy friendships_select on public.friendships for select using (auth.uid() = (select id from public.users where username = friendships.username));

drop policy if exists friendships_insert on public.friendships;
create policy friendships_insert on public.friendships for insert with check (auth.uid() = (select id from public.users where username = friendships.username));

drop policy if exists friendships_delete on public.friendships;
create policy friendships_delete on public.friendships for delete using (auth.uid() = (select id from public.users where username = friendships.username));

-- Сообщения: участник пары видит переписку; пишет/правит/удаляет своё.
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select
  using (from_user = (select username from public.users where id = auth.uid())
      or to_user   = (select username from public.users where id = auth.uid()));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert
  with check (from_user = (select username from public.users where id = auth.uid()));

drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages for update
  using (from_user = (select username from public.users where id = auth.uid()));

drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages for delete
  using (from_user = (select username from public.users where id = auth.uid()));

-- Реакции на блоки: читать всем, ставить/снимать только свою.
drop policy if exists block_reactions_select on public.block_reactions;
create policy block_reactions_select on public.block_reactions for select using (true);

drop policy if exists block_reactions_insert on public.block_reactions;
create policy block_reactions_insert on public.block_reactions for insert
  with check (username = (select username from public.users where id = auth.uid()));

drop policy if exists block_reactions_update on public.block_reactions;
create policy block_reactions_update on public.block_reactions for update
  using (username = (select username from public.users where id = auth.uid()));

drop policy if exists block_reactions_delete on public.block_reactions;
create policy block_reactions_delete on public.block_reactions for delete
  using (username = (select username from public.users where id = auth.uid()));

-- Чейнджлог: читать всем, писать — только админу.
drop policy if exists changelog_select on public.changelog;
create policy changelog_select on public.changelog for select using (true);

drop policy if exists changelog_insert on public.changelog;
create policy changelog_insert on public.changelog for insert
  with check (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

-- Баны и предупреждения: только админ (через отдельные политики или RPC).
drop policy if exists bans_select on public.bans;
create policy bans_select on public.bans for select using (true);

drop policy if exists bans_write on public.bans for insert
  with check (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

drop policy if exists warnings_insert on public.warnings for insert
  with check (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

-- Медиа: записи о загрузках видит владелец/админ.
drop policy if exists media_select on public.media;
create policy media_select on public.media for select
  using (owner_username = (select username from public.users where id = auth.uid())
      or exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

-- ═══ ФАЗА 4. Realtime ═══════════════════════════════════════════════════
-- Для чата и предупреждений: добавь таблицы в realtime-публикацию и поставь
-- REPLICA IDENTITY FULL на messages (нужно для UPDATE/DELETE-событий).
-- alter publication supabase_realtime add table public.messages;
-- alter table public.messages replica identity full;

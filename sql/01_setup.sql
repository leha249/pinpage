-- ═══════════════════════════════════════════════════════════════════════
-- PinPage — серверная часть, шаг 1 из 3: таблицы, сессии, функции.
--
-- Вход остаётся «логин + пароль» (Supabase Auth не нужен). Пароли хранятся как
-- есть, но в закрытой таблице user_secrets. После входа сервер выдаёт
-- случайный токен сессии; ВСЕ операции, меняющие данные или читающие личное
-- (сообщения, админ-действия), идут через функции pp_*, которые сами проверяют
-- токен. Подделать имя в localStorage больше нельзя — нужен действующий токен.
--
-- Порядок запуска (SQL Editor → New query → вставить → Run):
--   1. 01_setup.sql      (безопасно: только добавляет)
--   2. выложить новый клиентский код (GitHub Pages)
--   3. 02_lockdown.sql   (закрывает прямой доступ к таблицам)
--   4. 03_storage.sql    (лимиты бакета)
--   5. 99_verify.sql     (самопроверка, ничего не оставляет в базе)
-- Скрипт можно запускать повторно. Перед первым запуском сделай бэкап.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 0. Справочная схема (если таблицы уже есть — не трогается) ─────────────
create table if not exists public.users (
  username text primary key,
  display_name text not null,
  bio text not null default '',
  avatar text not null default '?',
  avatar_img text,
  avatar_media_id bigint,
  color text not null default '#7c6ff7',
  role text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.walls (
  username text primary key,
  blocks jsonb not null default '[]'::jsonb
);
create table if not exists public.friendships (
  username text not null,
  friend_username text not null,
  created_at timestamptz not null default now(),
  primary key (username, friend_username)
);
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  from_user text not null,
  to_user text not null,
  text text,
  media_url text,
  media_type text,
  media_id bigint,
  edited boolean not null default false,
  read boolean not null default false,
  at timestamptz not null default now()
);
create table if not exists public.bans (
  username text primary key,
  reason text,
  at timestamptz not null default now()
);
create table if not exists public.warnings (
  id bigint generated always as identity primary key,
  username text not null,
  text text not null,
  at timestamptz not null default now()
);
create table if not exists public.block_reactions (
  block_id text not null,
  username text not null,
  emoji text not null,
  at timestamptz not null default now(),
  primary key (block_id, username)
);
create table if not exists public.changelog (
  id bigint generated always as identity primary key,
  version text not null,
  title text not null,
  description text,
  author text,
  created_at timestamptz not null default now()
);
create table if not exists public.media (
  id bigint generated always as identity primary key,
  owner_username text not null,
  url text not null,
  kind text,
  mime_type text,
  created_at timestamptz not null default now()
);

-- Новые колонки: версия стены (защита от затирания правок) и «показано» для предупреждений.
alter table public.walls    add column if not exists updated_at timestamptz not null default now();
-- Версия стены — обычный счётчик (растёт на 1 при каждом сохранении). От времени и триггеров не зависит.
alter table public.walls    add column if not exists rev bigint not null default 0;
alter table public.warnings add column if not exists seen boolean not null default true;

-- Индексы под частые запросы.
create index if not exists messages_pair_idx   on public.messages (from_user, to_user, at desc);
create index if not exists messages_unread_idx on public.messages (to_user) where read = false;
create index if not exists friendships_rev_idx on public.friendships (friend_username);
create index if not exists media_owner_idx     on public.media (owner_username);

-- ── 1. Пароли, сессии, попытки входа ───────────────────────────────────────
create table if not exists public.user_secrets (
  username text primary key
    references public.users (username) on update cascade on delete cascade,
  password text not null
);
create table if not exists public.user_sessions (
  token text primary key,
  username text not null references public.users (username) on update cascade on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists user_sessions_user_idx on public.user_sessions (username);
create table if not exists public.login_attempts (
  username text not null,
  at timestamptz not null default now()
);
create index if not exists login_attempts_idx on public.login_attempts (username, at);

alter table public.user_secrets   enable row level security;
alter table public.user_sessions  enable row level security;
alter table public.login_attempts enable row level security;
revoke all on public.user_secrets, public.user_sessions, public.login_attempts from anon, authenticated;

-- Перенос паролей из users.password и удаление колонки.
-- Если от колонки зависит view — drop column откатится с ошибкой, ничего не потеряется.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'users' and column_name = 'password') then
    insert into public.user_secrets (username, password)
      select username, password from public.users where password is not null
    on conflict (username) do nothing;
    alter table public.users drop column password;
  end if;
end $$;

-- ── 2. Представления (читаются публично; считают как владелец) ──────────────
drop view if exists public.user_overview;
drop view if exists public.mutual_friends;
drop view if exists public.online_users;

create view public.online_users as
  select username from public.users where last_seen_at > now() - interval '2 minutes';

create view public.mutual_friends as
  select a.username, a.friend_username
  from public.friendships a
  join public.friendships b on b.username = a.friend_username and b.friend_username = a.username;

create view public.user_overview as
  select u.username, u.display_name, u.role, u.created_at,
    (select count(*) from public.friendships f where f.username = u.username)::int as friends_count,
    (select count(*) from public.media m where m.owner_username = u.username)::int as files_uploaded,
    (select count(*) from public.warnings w where w.username = u.username)::int as warnings_count,
    exists (select 1 from public.bans b where b.username = u.username) as is_banned
  from public.users u;

-- ── 3. Старые версии функций (меняется тип результата) ──────────────────────
-- Удаляем ВСЕ pp_*-функции любых версий (разный тип результата не даёт сделать create or replace,
-- ошибка «cannot change return type of existing function»). Ниже они создаются заново.
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'pp\_%'
  loop
    execute format('drop function if exists %s', r.sig);
  end loop;
end $$;

-- Если в users осталась служебная колонка id (от прежних экспериментов с Supabase Auth) без значения
-- по умолчанию, регистрация упадёт на «null value in column id». Даём ей значение по умолчанию.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'users' and column_name = 'id'
               and data_type = 'uuid' and column_default is null) then
    alter table public.users alter column id set default gen_random_uuid();
  end if;
end $$;

-- ── 4. Внутренние помощники (клиенту недоступны) ───────────────────────────
-- ВАЖНО: имя админа должно совпадать с ADMIN_USERNAME в src/types.ts.
create or replace function public.pp_admin_name() returns text
language sql immutable as $$ select 'leha249'::text $$;

create or replace function public.pp_who(p_token text) returns text
language sql security definer set search_path = public as $$
  select s.username from public.user_sessions s
  where s.token = p_token and s.created_at > now() - interval '180 days'
$$;

-- Кто вызывает: ошибка 'unauthorized' (нет сессии) или 'banned' (заблокирован).
create or replace function public.pp_uid(p_token text) returns text
language plpgsql security definer set search_path = public as $$
declare v_user text;
begin
  v_user := public.pp_who(p_token);
  if v_user is null then raise exception 'unauthorized'; end if;
  if exists (select 1 from public.bans b where b.username = v_user) then raise exception 'banned'; end if;
  return v_user;
end $$;

create or replace function public.pp_admin(p_token text) returns text
language plpgsql security definer set search_path = public as $$
declare v_user text;
begin
  v_user := public.pp_uid(p_token);
  if v_user <> public.pp_admin_name() then raise exception 'forbidden'; end if;
  return v_user;
end $$;

create or replace function public.pp_user_json(p_username text) returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'username', u.username, 'display_name', u.display_name, 'bio', coalesce(u.bio, ''),
    'avatar', u.avatar, 'avatar_img', u.avatar_img, 'avatar_media_id', u.avatar_media_id,
    'color', u.color, 'role', u.role)
  from public.users u where u.username = p_username
$$;

create or replace function public.pp_make_session(p_username text) returns text
language plpgsql security definer set search_path = public as $$
declare v_token text;
begin
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.user_sessions (token, username) values (v_token, p_username);
  delete from public.user_sessions where created_at < now() - interval '180 days';
  delete from public.user_sessions
   where username = p_username
     and token in (select s.token from public.user_sessions s
                   where s.username = p_username order by s.created_at desc offset 10);
  return v_token;
end $$;

create or replace function public.pp_mutual(p_a text, p_b text) returns boolean
language sql security definer set search_path = public as $$
  select exists (select 1 from public.friendships where username = p_a and friend_username = p_b)
     and exists (select 1 from public.friendships where username = p_b and friend_username = p_a)
$$;

-- Полное удаление пользователя и всех его данных (в одной транзакции).
create or replace function public.pp_purge_user(p_username text) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.block_reactions
   where username = p_username
      or block_id in (select e.v ->> 'id' from public.walls w, jsonb_array_elements(w.blocks) as e(v)
                      where w.username = p_username);
  delete from public.messages    where from_user = p_username or to_user = p_username;
  delete from public.friendships where username = p_username or friend_username = p_username;
  delete from public.warnings    where username = p_username;
  delete from public.bans        where username = p_username;
  delete from public.media       where owner_username = p_username;
  delete from public.walls       where username = p_username;
  delete from public.user_sessions  where username = p_username;
  delete from public.user_secrets   where username = p_username;
  delete from public.login_attempts where username = p_username;
  delete from public.users       where username = p_username;
end $$;

-- ── 5. Вход / регистрация / сессия ──────────────────────────────────────────
create or replace function public.pp_login(p_username text, p_password text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user text := lower(btrim(coalesce(p_username, '')));
  v_fails int;
  v_ban record;
begin
  select count(*) into v_fails from public.login_attempts
   where username = v_user and at > now() - interval '10 minutes';
  if v_fails >= 10 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;

  if not exists (select 1 from public.user_secrets s
                 where s.username = v_user and s.password = p_password) then
    insert into public.login_attempts (username) values (v_user);
    delete from public.login_attempts where at < now() - interval '1 day';
    return jsonb_build_object('ok', false, 'error', 'bad_credentials');
  end if;

  delete from public.login_attempts where username = v_user;
  select * into v_ban from public.bans b where b.username = v_user;
  if found then
    return jsonb_build_object('ok', false, 'error', 'banned', 'reason', v_ban.reason);
  end if;
  return jsonb_build_object('ok', true, 'token', public.pp_make_session(v_user),
                            'user', public.pp_user_json(v_user));
end $$;

create or replace function public.pp_register(
  p_username text, p_password text, p_display_name text, p_avatar text, p_color text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user text := lower(btrim(coalesce(p_username, '')));
  v_name text := btrim(coalesce(p_display_name, ''));
begin
  if v_user !~ '^[a-z0-9_]{3,24}$'
     or length(coalesce(p_password, '')) not between 6 and 200
     or length(v_name) not between 1 and 40
     or length(coalesce(p_avatar, '')) not between 1 and 8
     or coalesce(p_color, '') !~ '^#[0-9a-fA-F]{6}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  -- Имя админа и служебные имена занять нельзя (даже если аккаунт удалён).
  if v_user in (public.pp_admin_name(), 'admin', 'administrator', 'root', 'support',
                'system', 'pinpage', 'null', 'undefined') then
    return jsonb_build_object('ok', false, 'error', 'reserved');
  end if;

  insert into public.users (username, display_name, bio, avatar, color)
    values (v_user, v_name, '', p_avatar, p_color);
  insert into public.user_secrets (username, password) values (v_user, p_password);
  insert into public.walls (username, blocks) values (v_user, '[]'::jsonb)
    on conflict (username) do nothing;
  return jsonb_build_object('ok', true, 'token', public.pp_make_session(v_user),
                            'user', public.pp_user_json(v_user));
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'taken');
end $$;

create or replace function public.pp_resume(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user text; v_ban record;
begin
  v_user := public.pp_who(p_token);
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'unauthorized'); end if;
  select * into v_ban from public.bans b where b.username = v_user;
  if found then return jsonb_build_object('ok', false, 'error', 'banned', 'reason', v_ban.reason); end if;
  return jsonb_build_object('ok', true, 'user', public.pp_user_json(v_user));
end $$;

create or replace function public.pp_logout(p_token text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  delete from public.user_sessions where token = p_token;
  return true;
end $$;

-- Пульс раз в ~30 с: «в сети», проверка бана, новые предупреждения (показываются один раз).
create or replace function public.pp_status(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user text; v_ban record; v_warn jsonb;
begin
  v_user := public.pp_who(p_token);
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'unauthorized'); end if;
  select * into v_ban from public.bans b where b.username = v_user;
  if found then
    return jsonb_build_object('ok', true, 'banned', true, 'reason', v_ban.reason, 'warnings', '[]'::jsonb);
  end if;
  update public.users set last_seen_at = now() where username = v_user;
  with w as (
    update public.warnings set seen = true
     where username = v_user and seen = false
     returning warnings.text as wtext, warnings.at as wat
  )
  select coalesce(jsonb_agg(jsonb_build_object('text', w.wtext, 'at', w.wat) order by w.wat), '[]'::jsonb)
    into v_warn from w;
  return jsonb_build_object('ok', true, 'banned', false, 'warnings', v_warn);
end $$;

create or replace function public.pp_my_warnings(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user text;
begin
  v_user := public.pp_uid(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('text', w.text, 'at', w.at) order by w.at)
                   from public.warnings w where w.username = v_user), '[]'::jsonb);
end $$;

create or replace function public.pp_change_password(p_token text, p_old text, p_new text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_user text;
begin
  v_user := public.pp_uid(p_token);
  if length(coalesce(p_new, '')) not between 6 and 200 then return false; end if;
  update public.user_secrets set password = p_new where username = v_user and password = p_old;
  if not found then return false; end if;
  delete from public.user_sessions where username = v_user and token <> p_token;
  return true;
end $$;

create or replace function public.pp_delete_account(p_token text, p_password text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_user text;
begin
  v_user := public.pp_uid(p_token);
  if v_user = public.pp_admin_name() then return false; end if;
  if not exists (select 1 from public.user_secrets s where s.username = v_user and s.password = p_password) then
    return false;
  end if;
  perform public.pp_purge_user(v_user);
  return true;
end $$;

-- ── 6. Профиль, стена, друзья, реакции, файлы ───────────────────────────────
-- Профиль: обновляются только присланные поля. p_target — чужой профиль (только админ).
create or replace function public.pp_update_profile(p_token text, p_patch jsonb, p_target text default null)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_user text; v_target text;
begin
  v_user := public.pp_uid(p_token);
  v_target := lower(coalesce(nullif(btrim(p_target), ''), v_user));
  if v_target <> v_user then perform public.pp_admin(p_token); end if;
  if jsonb_typeof(p_patch) is distinct from 'object' then return false; end if;

  if p_patch ? 'display_name' and length(btrim(coalesce(p_patch ->> 'display_name', ''))) not between 1 and 40 then return false; end if;
  if p_patch ? 'bio' and length(coalesce(p_patch ->> 'bio', '')) > 500 then return false; end if;
  if p_patch ? 'avatar' and length(coalesce(p_patch ->> 'avatar', '')) not between 1 and 8 then return false; end if;
  if p_patch ? 'color' and coalesce(p_patch ->> 'color', '') !~ '^#[0-9a-fA-F]{6}$' then return false; end if;
  if p_patch ? 'avatar_img' and p_patch ->> 'avatar_img' is not null
     and p_patch ->> 'avatar_img' !~ '^https://' then return false; end if;

  update public.users set
    display_name    = case when p_patch ? 'display_name' then btrim(p_patch ->> 'display_name') else display_name end,
    bio             = case when p_patch ? 'bio' then coalesce(p_patch ->> 'bio', '') else bio end,
    avatar          = case when p_patch ? 'avatar' then p_patch ->> 'avatar' else avatar end,
    color           = case when p_patch ? 'color' then p_patch ->> 'color' else color end,
    avatar_img      = case when p_patch ? 'avatar_img' then p_patch ->> 'avatar_img' else avatar_img end,
    avatar_media_id = case when p_patch ? 'avatar_media_id' then (p_patch ->> 'avatar_media_id')::bigint else avatar_media_id end
  where username = v_target;
  return found;
end $$;

-- Сохранение стены с проверкой версии: если счётчик rev изменился после загрузки — 'conflict'.
create or replace function public.pp_set_wall(p_token text, p_username text, p_blocks jsonb, p_base bigint default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user text; v_target text; v_old jsonb; v_old_rev bigint; v_new_rev bigint;
begin
  v_user := public.pp_uid(p_token);
  v_target := lower(coalesce(nullif(btrim(p_username), ''), v_user));
  if v_target <> v_user then perform public.pp_admin(p_token); end if;
  if not exists (select 1 from public.users where username = v_target) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array'
     or jsonb_array_length(p_blocks) > 300 or length(p_blocks::text) > 1000000 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select w.blocks, w.rev into v_old, v_old_rev from public.walls w where w.username = v_target for update;
  if found and p_base is not null and v_old_rev <> p_base then
    return jsonb_build_object('ok', false, 'error', 'conflict');
  end if;

  -- Реакции на удалённые блоки больше не нужны.
  delete from public.block_reactions r
   where r.block_id in (select e.v ->> 'id' from jsonb_array_elements(coalesce(v_old, '[]'::jsonb)) as e(v))
     and not exists (select 1 from jsonb_array_elements(p_blocks) as n(v) where n.v ->> 'id' = r.block_id);

  insert into public.walls (username, blocks, rev, updated_at) values (v_target, p_blocks, 1, clock_timestamp())
    on conflict (username) do update
      set blocks = excluded.blocks, rev = public.walls.rev + 1, updated_at = excluded.updated_at
    returning walls.rev into v_new_rev;
  return jsonb_build_object('ok', true, 'version', v_new_rev);
end $$;

create or replace function public.pp_add_friend(p_token text, p_friend text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_user text;
begin
  v_user := public.pp_uid(p_token);
  if p_friend = v_user or not exists (select 1 from public.users where username = p_friend) then return false; end if;
  insert into public.friendships (username, friend_username) values (v_user, p_friend)
    on conflict (username, friend_username) do nothing;
  return true;
end $$;

create or replace function public.pp_remove_friend(p_token text, p_friend text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_user text;
begin
  v_user := public.pp_uid(p_token);
  delete from public.friendships where username = v_user and friend_username = p_friend;
  return found;
end $$;

create or replace function public.pp_set_reaction(p_token text, p_block_id text, p_emoji text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_user text;
begin
  v_user := public.pp_uid(p_token);
  if length(coalesce(p_block_id, '')) not between 1 and 64 or length(coalesce(p_emoji, '')) not between 1 and 16 then
    return false;
  end if;
  insert into public.block_reactions (block_id, username, emoji, at) values (p_block_id, v_user, p_emoji, now())
    on conflict (block_id, username) do update set emoji = excluded.emoji, at = excluded.at;
  return true;
end $$;

create or replace function public.pp_remove_reaction(p_token text, p_block_id text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_user text;
begin
  v_user := public.pp_uid(p_token);
  delete from public.block_reactions where block_id = p_block_id and username = v_user;
  return true;
end $$;

create or replace function public.pp_add_media(p_token text, p_url text, p_kind text, p_mime text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_user text; v_id bigint;
begin
  v_user := public.pp_uid(p_token);
  if coalesce(p_url, '') !~ '^https://' or p_kind not in ('avatar', 'wall_image', 'wall_video', 'wall_music', 'wall_cover', 'chat') then
    return null;
  end if;
  insert into public.media (owner_username, url, kind, mime_type) values (v_user, p_url, p_kind, p_mime)
    returning id into v_id;
  return v_id;
end $$;

-- ── 7. Личные сообщения (читаются ТОЛЬКО через эти функции) ─────────────────
create or replace function public.pp_send_message(
  p_token text, p_to text, p_text text, p_media_url text, p_media_type text, p_media_id bigint
) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_user text; v_text text := nullif(btrim(coalesce(p_text, '')), '');
begin
  v_user := public.pp_uid(p_token);
  if not public.pp_mutual(v_user, p_to) then return false; end if;
  if v_text is null and p_media_url is null then return false; end if;
  if v_text is not null and length(v_text) > 2000 then return false; end if;
  if p_media_url is not null and (p_media_url !~ '^https://' or coalesce(p_media_type, '') not in ('image', 'video')) then
    return false;
  end if;
  insert into public.messages (from_user, to_user, text, media_url, media_type, media_id)
    values (v_user, p_to, v_text, p_media_url, p_media_type, p_media_id);
  return true;
end $$;

-- Последние p_limit сообщений переписки, от старых к новым.
create or replace function public.pp_get_messages(p_token text, p_other text, p_limit int default 300) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user text; v_lim int := least(greatest(coalesce(p_limit, 300), 1), 1000);
begin
  v_user := public.pp_uid(p_token);
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.at, t.id)
    from (select m.id, m.from_user, m.to_user, m.text, m.media_url, m.media_type, m.media_id,
                 m.edited, m.read, m.at
          from public.messages m
          where (m.from_user = v_user and m.to_user = p_other) or (m.from_user = p_other and m.to_user = v_user)
          order by m.at desc, m.id desc limit v_lim) t
  ), '[]'::jsonb);
end $$;

create or replace function public.pp_edit_message(p_token text, p_id bigint, p_text text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_user text; v_text text := nullif(btrim(coalesce(p_text, '')), '');
begin
  v_user := public.pp_uid(p_token);
  if v_text is null or length(v_text) > 2000 then return false; end if;
  update public.messages set text = v_text, edited = true where id = p_id and from_user = v_user;
  return found;
end $$;

create or replace function public.pp_delete_message(p_token text, p_id bigint) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_user text;
begin
  v_user := public.pp_uid(p_token);
  delete from public.messages where id = p_id and from_user = v_user;
  return found;
end $$;

create or replace function public.pp_mark_read(p_token text, p_other text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_user text;
begin
  v_user := public.pp_uid(p_token);
  update public.messages set read = true where from_user = p_other and to_user = v_user and read = false;
  return true;
end $$;

create or replace function public.pp_unread_counts(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user text;
begin
  v_user := public.pp_uid(p_token);
  return coalesce((
    select jsonb_object_agg(c.from_user, c.n)
    from (select m.from_user, count(*)::int as n from public.messages m
          where m.to_user = v_user and m.read = false group by m.from_user) c
  ), '{}'::jsonb);
end $$;

-- ── 8. Публичная проверка бана (только да/нет, без причины) ─────────────────
create or replace function public.pp_is_banned(p_username text) returns boolean
language sql security definer set search_path = public as $$
  select exists (select 1 from public.bans b where b.username = p_username)
$$;

-- ── 9. Админ-функции (токен должен принадлежать админу) ─────────────────────
create or replace function public.pp_admin_overview(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.pp_admin(p_token);
  return jsonb_build_object(
    'bans', coalesce((select jsonb_object_agg(b.username,
              jsonb_build_object('username', b.username, 'reason', b.reason, 'at', b.at)) from public.bans b), '{}'::jsonb),
    'warnings', coalesce((select jsonb_object_agg(c.username, c.n)
              from (select w.username, count(*)::int as n from public.warnings w group by w.username) c), '{}'::jsonb));
end $$;

create or replace function public.pp_admin_ban(p_token text, p_target text, p_reason text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform public.pp_admin(p_token);
  if p_target = public.pp_admin_name() or not exists (select 1 from public.users where username = p_target) then
    return false;
  end if;
  insert into public.bans (username, reason, at) values (p_target, left(coalesce(p_reason, ''), 300), now())
    on conflict (username) do update set reason = excluded.reason, at = excluded.at;
  return true;
end $$;

create or replace function public.pp_admin_unban(p_token text, p_target text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform public.pp_admin(p_token);
  delete from public.bans where username = p_target;
  return found;
end $$;

create or replace function public.pp_admin_warn(p_token text, p_target text, p_text text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform public.pp_admin(p_token);
  if length(btrim(coalesce(p_text, ''))) not between 1 and 500
     or not exists (select 1 from public.users where username = p_target) then
    return false;
  end if;
  insert into public.warnings (username, text, seen) values (p_target, btrim(p_text), false);
  return true;
end $$;

create or replace function public.pp_admin_warnings(p_token text, p_target text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.pp_admin(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('text', w.text, 'at', w.at) order by w.at)
                   from public.warnings w where w.username = p_target), '[]'::jsonb);
end $$;

create or replace function public.pp_admin_clear_warnings(p_token text, p_target text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform public.pp_admin(p_token);
  delete from public.warnings where username = p_target;
  return true;
end $$;

create or replace function public.pp_admin_set_password(p_token text, p_target text, p_new text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform public.pp_admin(p_token);
  if length(coalesce(p_new, '')) not between 6 and 200 then return false; end if;
  update public.user_secrets set password = p_new where username = p_target;
  if not found then return false; end if;
  delete from public.user_sessions where username = p_target;
  return true;
end $$;

create or replace function public.pp_admin_delete_user(p_token text, p_target text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform public.pp_admin(p_token);
  if p_target = public.pp_admin_name() or not exists (select 1 from public.users where username = p_target) then
    return false;
  end if;
  perform public.pp_purge_user(p_target);
  return true;
end $$;

create or replace function public.pp_admin_add_changelog(p_token text, p_version text, p_title text, p_description text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_admin text;
begin
  v_admin := public.pp_admin(p_token);
  if length(btrim(coalesce(p_version, ''))) = 0 or length(btrim(coalesce(p_title, ''))) = 0 then return false; end if;
  insert into public.changelog (version, title, description, author)
    values (btrim(p_version), btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''), v_admin);
  return true;
end $$;

-- ── 10. Права на выполнение ─────────────────────────────────────────────────
-- Сначала у ВСЕХ pp_* забираем доступ (в Supabase по умолчанию anon может
-- вызывать любые функции), потом открываем только публичные точки входа.
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'pp\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;

  for r in select p.oid::regprocedure as sig
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = any (array[
             'pp_login', 'pp_register', 'pp_resume', 'pp_logout', 'pp_status', 'pp_my_warnings',
             'pp_change_password', 'pp_delete_account', 'pp_update_profile', 'pp_set_wall',
             'pp_add_friend', 'pp_remove_friend', 'pp_set_reaction', 'pp_remove_reaction', 'pp_add_media',
             'pp_send_message', 'pp_get_messages', 'pp_edit_message', 'pp_delete_message',
             'pp_mark_read', 'pp_unread_counts', 'pp_is_banned',
             'pp_admin_overview', 'pp_admin_ban', 'pp_admin_unban', 'pp_admin_warn', 'pp_admin_warnings',
             'pp_admin_clear_warnings', 'pp_admin_set_password', 'pp_admin_delete_user', 'pp_admin_add_changelog'])
  loop
    execute format('grant execute on function %s to anon, authenticated', r.sig);
  end loop;
end $$;

grant select on public.user_overview, public.mutual_friends, public.online_users to anon, authenticated;

-- Обновить кэш API, чтобы PostgREST увидел новые функции.
notify pgrst, 'reload schema';

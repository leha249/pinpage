-- ═══════════════════════════════════════════════════════════════════════
-- PinPage — перенос существующих пользователей в Supabase Auth (чистый SQL).
--
-- ⚠️  Напрямую вставляет в служебные таблицы auth.users / auth.identities.
--     Структура этих таблиц зависит от версии Supabase. Перед запуском
--     сделай бэкап и проверь, что колонки ниже существуют:
--        select * from auth.users limit 1;
--        select * from auth.identities limit 1;
--
-- ЧТО ДЕЛАЕТ:
--   1) включает pgcrypto (для bcrypt);
--   2) добавляет колонку public.users.id;
--   3) для каждого пользователя создаёт auth-аккаунт и связывает id.
--
-- ПАРОЛИ:
--   * открытый текст в public.users.password → используется как пароль;
--   * sha256/pbkdf2 (хеш) → ставится временный пароль 'ChangeMe_12345'
--     (восстановить исходный из хеша невозможно — сброс через «забыл пароль»).
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

alter table public.users add column if not exists id uuid;

do $$
declare
  u record;
  new_id uuid;
  new_email text;
  plain_pw text;
begin
  for u in
    select username, password from public.users where id is null
  loop
    new_id    := gen_random_uuid();
    new_email := u.username || '@pinpage.local';

    if u.password ~ '^[a-f0-9]{64}$' or u.password like 'pbkdf2$%' then
      plain_pw := 'ChangeMe_12345';   -- временный пароль для захешированных
    else
      plain_pw := u.password;         -- открытый текст — используем как есть
    end if;

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      new_id, 'authenticated', 'authenticated', new_email,
      crypt(plain_pw, gen_salt('bf', 10)),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('username', u.username),
      now(), now()
    );

    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), new_id::text, new_id,
      jsonb_build_object('sub', new_id::text, 'email', new_email),
      'email', now(), now(), now()
    );

    update public.users set id = new_id where username = u.username;
  end loop;
end $$;

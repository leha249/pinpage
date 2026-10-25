-- ═══════════════════════════════════════════════════════════════════════
-- PinPage — шаг 2 из 3: закрываем прямой доступ к таблицам.
--
-- ЗАПУСКАТЬ ТОЛЬКО ПОСЛЕ того, как выложен НОВЫЙ клиентский код (тот, что
-- работает через pp_*-функции). Старая версия сайта после этого шага перестанет
-- работать — это ожидаемо.
--
-- Итог: через публичный ключ можно ТОЛЬКО читать публичное (профили, стены,
-- списки друзей, реакции, журнал изменений, «в сети»). Любое изменение и всё
-- личное (сообщения, баны, предупреждения, пароли, сессии) — только через
-- функции с проверкой токена.
-- ═══════════════════════════════════════════════════════════════════════
do $$
declare
  t text;
  r record;
begin
  -- 1. Все таблицы: RLS включён, старые политики удалены, права сняты.
  foreach t in array array[
    'users', 'walls', 'friendships', 'messages', 'bans', 'warnings', 'block_reactions',
    'changelog', 'media', 'user_secrets', 'user_sessions', 'login_attempts']
  loop
    execute format('alter table public.%I enable row level security', t);
    for r in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', r.policyname, t);
    end loop;
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;

  -- 2. Публично читаемое: только SELECT.
  foreach t in array array['users', 'walls', 'friendships', 'block_reactions', 'changelog']
  loop
    execute format('create policy pp_read_all on public.%I for select using (true)', t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end $$;

grant select on public.user_overview, public.mutual_friends, public.online_users to anon, authenticated;

-- Проверка (должна вернуть ошибку permission denied):
--   set role anon; select * from public.messages; reset role;
notify pgrst, 'reload schema';

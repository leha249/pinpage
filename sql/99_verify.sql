-- ═══════════════════════════════════════════════════════════════════════
-- Самопроверка серверной части. Ничего не оставляет в базе: всё выполняется
-- в блоке, который в конце намеренно откатывается.
-- Запусти после 01_setup.sql. Успех = сообщение «ВСЕ ПРОВЕРКИ ПРОШЛИ».
-- (В Supabase SQL Editor смотри вкладку Results/Messages.)
-- ═══════════════════════════════════════════════════════════════════════
do $$
declare
  r jsonb; ta text; tb text; tadm text; v_ver bigint; v_msgs jsonb; v_count int;
  v_made_admin boolean := false;
begin
  -- регистрация и вход
  r := public.pp_register('zz_verify_a', 'secret1', 'Тест А', 'Т', '#112233');
  assert (r ->> 'ok')::boolean, 'register A: ' || r::text;
  ta := r ->> 'token';
  r := public.pp_register('zz_verify_b', 'secret2', 'Тест Б', 'Б', '#223344');
  assert (r ->> 'ok')::boolean, 'register B';
  tb := r ->> 'token';
  assert (public.pp_register('zz_verify_a', 'secret1', 'Dup', 'D', '#112233') ->> 'error') = 'taken', 'duplicate name';
  assert (public.pp_register('leha249', 'secret1', 'X', 'X', '#112233') ->> 'error') = 'reserved', 'reserved admin name';
  assert (public.pp_register('ab', 'secret1', 'X', 'X', '#112233') ->> 'error') = 'invalid', 'short name';
  assert (public.pp_register('zz_verify_c', '123', 'X', 'X', '#112233') ->> 'error') = 'invalid', 'short password';
  assert (public.pp_login('zz_verify_a', 'wrong') ->> 'error') = 'bad_credentials', 'wrong password';
  assert (public.pp_login('zz_verify_a', 'secret1') ->> 'ok')::boolean, 'login';
  assert (public.pp_resume(ta) ->> 'ok')::boolean, 'resume';
  assert (public.pp_resume('bad-token') ->> 'error') = 'unauthorized', 'resume bad token';

  -- стена: версии и конфликт
  r := public.pp_set_wall(ta, 'zz_verify_a', '[{"id":"b1","type":"text","x":0,"y":0,"w":100,"h":50,"content":"hi"}]'::jsonb, null);
  assert (r ->> 'ok')::boolean, 'set wall';
  v_ver := (r ->> 'version')::bigint;
  r := public.pp_set_wall(ta, 'zz_verify_a', '[]'::jsonb, v_ver);
  assert (r ->> 'ok')::boolean, 'set wall with current version';
  r := public.pp_set_wall(ta, 'zz_verify_a', '[]'::jsonb, v_ver);
  assert (r ->> 'error') = 'conflict', 'stale version must conflict';
  begin
    perform public.pp_set_wall(tb, 'zz_verify_a', '[]'::jsonb, null);
    assert false, 'чужую стену менять нельзя';
  exception when others then
    assert sqlerrm = 'forbidden', 'ожидали forbidden, получили ' || sqlerrm;
  end;

  -- профиль
  assert public.pp_update_profile(ta, '{"bio":"привет"}'::jsonb), 'update profile';
  assert not public.pp_update_profile(ta, '{"color":"red; background:url(x)"}'::jsonb), 'bad color rejected';
  assert (select bio from public.users where username = 'zz_verify_a') = 'привет', 'bio saved';

  -- сообщения: без взаимной дружбы нельзя, с ней можно
  assert not public.pp_send_message(ta, 'zz_verify_b', 'hi', null, null, null), 'non-mutual must fail';
  assert public.pp_add_friend(ta, 'zz_verify_b'), 'add friend A→B';
  assert not public.pp_send_message(ta, 'zz_verify_b', 'hi', null, null, null), 'one-way must fail';
  assert public.pp_add_friend(tb, 'zz_verify_a'), 'add friend B→A';
  assert public.pp_send_message(ta, 'zz_verify_b', 'привет', null, null, null), 'send';
  assert (public.pp_unread_counts(tb) ->> 'zz_verify_a')::int = 1, 'unread count';
  v_msgs := public.pp_get_messages(tb, 'zz_verify_a', 300);
  assert jsonb_array_length(v_msgs) = 1, 'get messages';
  assert public.pp_mark_read(tb, 'zz_verify_a'), 'mark read';
  assert public.pp_unread_counts(tb) = '{}'::jsonb, 'unread cleared';
  assert not public.pp_edit_message(tb, (v_msgs -> 0 ->> 'id')::bigint, 'чужое'), 'edit foreign must fail';
  assert public.pp_edit_message(ta, (v_msgs -> 0 ->> 'id')::bigint, 'правка'), 'edit own';
  assert public.pp_delete_message(ta, (v_msgs -> 0 ->> 'id')::bigint), 'delete own';

  -- смена пароля
  assert not public.pp_change_password(ta, 'wrong', 'newpass1'), 'wrong old password';
  assert public.pp_change_password(ta, 'secret1', 'newpass1'), 'change password';
  assert (public.pp_login('zz_verify_a', 'newpass1') ->> 'ok')::boolean, 'login with new password';

  -- админ-часть (только если админа можно создать без конфликта)
  if not exists (select 1 from public.users where username = public.pp_admin_name()) then
    insert into public.users (username, display_name, avatar, color) values (public.pp_admin_name(), 'Admin', 'A', '#ff0000');
    insert into public.user_secrets values (public.pp_admin_name(), 'adminpass');
    v_made_admin := true;
  end if;
  if v_made_admin then
    tadm := public.pp_login(public.pp_admin_name(), 'adminpass') ->> 'token';
    begin
      perform public.pp_admin_ban(ta, 'zz_verify_b', 'x');
      assert false, 'обычный пользователь не должен банить';
    exception when others then
      assert sqlerrm = 'forbidden', 'ожидали forbidden, получили ' || sqlerrm;
    end;
    assert public.pp_admin_ban(tadm, 'zz_verify_b', 'тест'), 'admin ban';
    assert public.pp_is_banned('zz_verify_b'), 'is_banned';
    assert (public.pp_status(tb) ->> 'banned')::boolean, 'status shows ban';
    assert public.pp_admin_unban(tadm, 'zz_verify_b'), 'admin unban';
    assert public.pp_admin_warn(tadm, 'zz_verify_b', 'предупреждение'), 'admin warn';
    assert jsonb_array_length(public.pp_status(tb) -> 'warnings') = 1, 'warning delivered once';
    assert jsonb_array_length(public.pp_status(tb) -> 'warnings') = 0, 'warning not repeated';
    assert not public.pp_admin_ban(tadm, public.pp_admin_name(), 'self'), 'cannot ban admin';
    assert public.pp_admin_set_password(tadm, 'zz_verify_b', 'adminset1'), 'admin set password';
    assert (public.pp_login('zz_verify_b', 'adminset1') ->> 'ok')::boolean, 'login after admin password';
    assert public.pp_admin_delete_user(tadm, 'zz_verify_b'), 'admin delete user';
  end if;

  -- удаление аккаунта требует пароль
  assert not public.pp_delete_account(ta, 'wrong'), 'delete with wrong password';
  assert public.pp_delete_account(ta, 'newpass1'), 'delete account';
  select count(*) into v_count from public.users where username = 'zz_verify_a';
  assert v_count = 0, 'user removed';

  raise exception 'ALL_OK_ROLLBACK';
exception when others then
  if sqlerrm = 'ALL_OK_ROLLBACK' then
    raise notice 'ВСЕ ПРОВЕРКИ ПРОШЛИ (изменения откатены)';
  else
    raise exception 'ПРОВЕРКА НЕ ПРОШЛА: %', sqlerrm;
  end if;
end $$;

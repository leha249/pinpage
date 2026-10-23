import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { DB, supabase } from '../supabase';

/**
 * Жизненный цикл сессии:
 *  - при старте восстанавливает вход из localStorage (с проверкой бана);
 *  - пока человек в аккаунте: "пульс" статуса «в сети» раз в минуту и две
 *    Realtime-подписки — на бан (мгновенный выход) и на предупреждения.
 * Всё убирается за собой при выходе/размонтировании.
 */
export function useSession(): boolean {
  const { currentUser, setCurrentUser, notify } = useApp();
  const [booting, setBooting] = useState(true);

  // 1. Восстановление сессии
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = localStorage.getItem('pp_session');
      if (saved) {
        const [u, ban] = await Promise.all([DB.getUser(saved), DB.getBan(saved)]);
        if (!cancelled) {
          if (u && !ban) setCurrentUser(u);
          else localStorage.removeItem('pp_session');
        }
      }
      if (!cancelled) setBooting(false);
    })();
    return () => { cancelled = true; };
  }, [setCurrentUser]);

  const username = currentUser?.username;

  // 2. Пульс "в сети"
  useEffect(() => {
    if (!username) return;
    DB.touchLastSeen(username);
    const t = window.setInterval(() => DB.touchLastSeen(username), 60_000);
    return () => window.clearInterval(t);
  }, [username]);

  // 3. Realtime: бан → мгновенный выход; предупреждение → уведомление
  useEffect(() => {
    if (!username) return;
    const banCh = supabase
      .channel(`ban-kick-${username}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bans' }, (p) => {
        const row = p.new as { username: string; reason?: string };
        if (row.username === username) {
          notify('Аккаунт заблокирован: ' + (row.reason || 'нарушение правил'), 'err');
          setCurrentUser(null);
        }
      })
      .subscribe();
    const warnCh = supabase
      .channel(`warnings-${username}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'warnings' }, (p) => {
        const row = p.new as { username: string; text: string };
        if (row.username === username) notify('Предупреждение от администрации: ' + row.text, 'err');
      })
      .subscribe();
    return () => { supabase.removeChannel(banCh); supabase.removeChannel(warnCh); };
  }, [username, notify, setCurrentUser]);

  return booting;
}

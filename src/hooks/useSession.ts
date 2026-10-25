import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { DB, onAuthLost } from '../supabase';

export interface SessionState {
  booting: boolean;
  /** Не удалось связаться с сервером при запуске (сессию НЕ сбрасываем — просто предлагаем повторить). */
  offline: boolean;
  retry: () => void;
}

const POLL_MS = 30_000;

/**
 * Жизненный цикл сессии:
 *  - при старте восстанавливает вход по токену; сбой сети ≠ выход из аккаунта;
 *  - пока человек в аккаунте: пульс раз в 30 с — «в сети», бан (мгновенный выход)
 *    и новые предупреждения администрации (показываются окном, пока не подтвердят);
 *  - если сервер перестал признавать токен (истёк, бан) — выходим с пояснением.
 */
export function useSession(): SessionState {
  const { currentUser, setCurrentUser, notify, showWarnings } = useApp();
  const [booting, setBooting] = useState(true);
  const [offline, setOffline] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // 1. Восстановление сессии
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await DB.resume();
        if (cancelled) return;
        setOffline(false);
        if (r.ok) setCurrentUser(r.user);
        else if (r.error === 'banned') notify('Аккаунт заблокирован: ' + (r.reason || 'нарушение правил'), 'err');
        else if (r.error === 'unauthorized') notify('Сессия истекла — войди снова', 'err');
      } catch {
        if (!cancelled) setOffline(true);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => { cancelled = true; };
  }, [attempt, setCurrentUser, notify]);

  const retry = useCallback(() => { setBooting(true); setAttempt((a) => a + 1); }, []);

  // 2. Сервер больше не признаёт сессию (любой запрос вернул unauthorized/banned)
  useEffect(() => onAuthLost((code) => {
    setCurrentUser(null);
    notify(code === 'banned' ? 'Аккаунт заблокирован администрацией' : 'Сессия истекла — войди снова', 'err');
  }), [setCurrentUser, notify]);

  // 3. Пульс: «в сети» + бан + предупреждения
  const username = currentUser?.username;
  useEffect(() => {
    if (!username) return;
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const s = await DB.status();
        if (stopped) return;
        if (s.banned) {
          notify('Аккаунт заблокирован: ' + (s.reason || 'нарушение правил'), 'err');
          setCurrentUser(null);
          void DB.logout();
          return;
        }
        if (s.warnings.length) showWarnings(s.warnings);
      } catch { /* нет связи — попробуем в следующий раз */ }
    };
    void tick();
    const t = window.setInterval(tick, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { stopped = true; window.clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [username, notify, setCurrentUser, showWarnings]);

  return { booting, offline, retry };
}

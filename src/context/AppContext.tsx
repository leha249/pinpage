import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
import type { Tab, Theme, User, Warning } from '../types';
import { DB } from '../supabase';

interface Toast { msg: string; type: 'ok' | 'err'; id: number }

interface AppState {
  currentUser: User | null;
  setCurrentUser: (u: User | null) => void;
  /** Обновить данные текущего пользователя БЕЗ навигации (профиль, аватар). */
  updateUser: (u: User) => void;
  tab: Tab;
  setTab: (t: Tab) => void;
  viewingUser: string | null;
  navigateToWall: (username: string, opts?: { edit?: boolean; adminAs?: string }) => void;
  editing: boolean;
  setEditing: (b: boolean) => void;
  adminEditingAs: string | null;
  setAdminEditingAs: (u: string | null) => void;
  /** Предупреждения администрации, которые ещё не подтверждены (показываются окном). */
  pendingWarnings: Warning[];
  showWarnings: (w: Warning[]) => void;
  dismissWarnings: () => void;
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  toast: Toast | null;
  notify: (msg: string, type?: 'ok' | 'err') => void;
  logout: () => void;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside <AppProvider>');
  return v;
}

/** Плавный переход через View Transitions API, если браузер умеет; иначе — мгновенно. */
export function withTransition(fn: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  // flushSync: браузер делает снимок «после» сразу по возврату из колбэка, поэтому DOM
  // должен обновиться синхронно — иначе анимация перехода не видит изменений.
  if (doc.startViewTransition) doc.startViewTransition(() => { flushSync(fn); });
  else fn();
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUserRaw] = useState<User | null>(null);
  const [tab, setTabRaw] = useState<Tab>('wall');
  const [viewingUser, setViewingUser] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [adminEditingAs, setAdminEditingAs] = useState<string | null>(null);
  const [pendingWarnings, setPendingWarnings] = useState<Warning[]>([]);
  const [theme, setThemeState] = useState<Theme>(
    () => (localStorage.getItem('pp_theme') === 'light' ? 'light' : 'dark')
  );
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number>();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('pp_theme', theme);
  }, [theme]);

  const notify = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => {
    window.clearTimeout(toastTimer.current);
    setToast({ msg, type, id: Date.now() });
    // Ошибки висят дольше: их надо успеть прочитать.
    toastTimer.current = window.setTimeout(() => setToast(null), type === 'err' ? 6000 : 2800);
  }, []);

  const setCurrentUser = useCallback((u: User | null) => {
    setCurrentUserRaw(u);
    // Токен сессии хранит слой данных (DB.login/resume/logout); здесь — только состояние интерфейса.
    if (u) {
      setViewingUser(u.username);
      setTabRaw('wall');
    } else {
      setPendingWarnings([]);
    }
    setEditing(false);
    setAdminEditingAs(null);
  }, []);

  const updateUser = useCallback((u: User) => setCurrentUserRaw(u), []);

  const setTab = useCallback((t: Tab) => {
    withTransition(() => {
      setTabRaw(t);
      setEditing(false);
      setAdminEditingAs(null);
    });
  }, []);

  const navigateToWall = useCallback((username: string, opts?: { edit?: boolean; adminAs?: string }) => {
    // Всё в одном переходе: View Transition вызывает колбэк асинхронно, поэтому
    // раздельные вызовы set* снаружи перезаписывали бы друг друга.
    withTransition(() => {
      setViewingUser(username);
      setTabRaw('wall');
      setEditing(!!opts?.edit);
      setAdminEditingAs(opts?.adminAs ?? null);
    });
  }, []);

  const toggleTheme = useCallback(() => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')), []);
  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const logout = useCallback(() => { void DB.logout(); setCurrentUser(null); }, [setCurrentUser]);
  const showWarnings = useCallback((w: Warning[]) => setPendingWarnings((prev) => [...prev, ...w]), []);
  const dismissWarnings = useCallback(() => setPendingWarnings([]), []);

  const value = useMemo<AppState>(() => ({
    currentUser, setCurrentUser, updateUser, tab, setTab, viewingUser, navigateToWall,
    editing, setEditing, adminEditingAs, setAdminEditingAs,
    pendingWarnings, showWarnings, dismissWarnings,
    theme, toggleTheme, setTheme, toast, notify, logout,
  }), [currentUser, setCurrentUser, updateUser, tab, setTab, viewingUser, navigateToWall, editing,
       adminEditingAs, pendingWarnings, showWarnings, dismissWarnings, theme, toggleTheme, setTheme, toast, notify, logout]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

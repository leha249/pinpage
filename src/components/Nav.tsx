import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { DB, supabase } from '../supabase';
import { ADMIN_USERNAME, type Tab } from '../types';
import Avatar from './Avatar';

const TABS: { id: Tab; label: string }[] = [
  { id: 'wall', label: 'Стена' },
  { id: 'friends', label: 'Друзья' },
  { id: 'changelog', label: 'Обновления' },
  { id: 'settings', label: 'Настройки' },
];

export default function Nav() {
  const { currentUser, tab, setTab, navigateToWall, theme, toggleTheme, logout } = useApp();
  const me = currentUser!;
  const [unread, setUnread] = useState(false);
  const [newChangelog, setNewChangelog] = useState(false);

  // Точка на «Друзья»: считаем при смене вкладки + мгновенно по Realtime.
  useEffect(() => {
    DB.getUnreadCounts(me.username).then((c) => setUnread(Object.values(c).some((n) => n > 0)));
    const ch = supabase
      .channel(`nav-unread-${me.username}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => {
        if ((p.new as { to_user: string }).to_user === me.username) setUnread(true);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [me.username, tab]);

  useEffect(() => {
    DB.getChangelog().then((entries) => {
      if (!entries.length) return setNewChangelog(false);
      const seen = parseInt(localStorage.getItem('pp_changelog_seen') || '0', 10);
      setNewChangelog(entries[0].at > seen);
    });
  }, [tab]);

  const dot = (tabId: Tab) =>
    (tabId === 'friends' && unread && tab !== 'friends') || (tabId === 'changelog' && newChangelog && tab !== 'changelog');

  return (
    <nav id="nav">
      <button className="nav-logo" onClick={() => navigateToWall(me.username)}>PinPage</button>
      <div className="nav-spacer" />

      {TABS.map((t) => (
        <button
          key={t.id}
          className={'nav-tab' + (tab === t.id ? ' active' : '')}
          onClick={() => (t.id === 'wall' ? navigateToWall(me.username) : setTab(t.id))}
        >
          {t.label}
          {dot(t.id) && <span className="nav-unread-dot" />}
        </button>
      ))}

      <div className="nav-div" />
      <Avatar user={me} size={28} />
      <span className="nav-username">{me.displayName}</span>

      {me.username === ADMIN_USERNAME && (
        <button
          className="btn"
          style={{ borderColor: 'color-mix(in oklab, var(--warn) 40%, transparent)', color: 'var(--warn)' }}
          onClick={() => setTab('admin')}
        >
          Админ
        </button>
      )}

      <button className="theme-toggle" title="Сменить тему" onClick={toggleTheme}>
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
      <button className="btn" onClick={logout}>Выйти</button>
    </nav>
  );
}

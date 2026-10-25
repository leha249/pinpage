import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '../../types';
import { useApp } from '../../context/AppContext';
import { DB } from '../../supabase';
import Avatar from '../Avatar';
import ChatPane from './ChatPane';

const POLL_MS = 15_000;

export default function FriendsChat() {
  const { currentUser, navigateToWall, notify } = useApp();
  const me = currentUser!.username;

  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [friends, setFriends] = useState<string[]>([]);
  const [followers, setFollowers] = useState<string[]>([]); // кто добавил меня
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<'friends' | 'all'>('friends');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [u, f, fol, un, on] = await Promise.all([
        DB.getAllUsers(), DB.getFriends(me), DB.getFollowers(me), DB.getUnreadCounts(), DB.getOnlineUsernames(),
      ]);
      setAllUsers(u); setFriends(f); setFollowers(fol); setUnread(un); setOnline(on);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [me]);

  // Загрузка + обновление раз в 15 с (новые сообщения, «в сети», новые заявки в друзья)
  useEffect(() => {
    void load();
    const t = window.setInterval(() => { if (document.visibilityState !== 'hidden') void load(); }, POLL_MS);
    return () => window.clearInterval(t);
  }, [load]);

  const byName = useMemo(() => new Map(allUsers.map((u) => [u.username, u])), [allUsers]);
  const friendSet = useMemo(() => new Set(friends), [friends]);
  const followerSet = useMemo(() => new Set(followers), [followers]);
  const others = useMemo(() => allUsers.filter((u) => u.username !== me), [allUsers, me]);
  const q = query.trim().toLowerCase();
  const match = (u: User) => !q || (u.displayName + u.username).toLowerCase().includes(q);

  async function addFriend(u: User) {
    if (!(await DB.addFriend(u.username))) { notify('Не удалось добавить в друзья', 'err'); return; }
    notify('Добавлен!');
    setFriends((f) => (f.includes(u.username) ? f : [...f, u.username]));
  }

  function open(u: User) {
    setUnread((x) => ({ ...x, [u.username]: 0 }));
    setActive(u.username);
  }

  // Обычная функция отрисовки, а не компонент: компонент, объявленный внутри
  // рендера, пересоздавался бы при каждом обновлении и сбрасывал состояние строк.
  const renderRow = (u: User, showAdd: boolean, addLabel = '+ Добавить') => {
    const isFr = friendSet.has(u.username);
    const n = isFr ? unread[u.username] || 0 : 0;
    const go = () => (isFr ? open(u) : navigateToWall(u.username));
    return (
      <div
        key={u.username}
        className={'fl-item' + (active === u.username ? ' active' : '')}
        role="button" tabIndex={0}
        onClick={go}
        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); go(); } }}
      >
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Avatar user={u} size={32} />
          {online.has(u.username) && <span className="online-dot" />}
        </div>
        <div className="fl-item-info">
          <div className="fl-item-name">{u.displayName}</div>
          <div className="fl-item-sub">@{u.username}{u.bio ? ' · ' + u.bio : ''}</div>
        </div>
        {n > 0 && <span className="fl-unread-badge">{n > 9 ? '9+' : n}</span>}
        {showAdd && !isFr && (
          <button className="fl-add-btn" onClick={(e) => { e.stopPropagation(); void addFriend(u); }}>{addLabel}</button>
        )}
        {showAdd && isFr && <span style={{ fontSize: 10, color: 'var(--text3)' }}>✓</span>}
      </div>
    );
  };

  if (loading) return <div id="loading-screen"><div className="loader" /><p>Загружаем...</p></div>;

  const friendList = friends.map((f) => byName.get(f)).filter((u): u is User => !!u && match(u));
  // Люди, которые добавили меня, а я их — нет: показываем отдельно, чтобы ответить взаимностью.
  const requests = followers.filter((f) => !friendSet.has(f)).map((f) => byName.get(f)).filter((u): u is User => !!u && match(u));
  const requestSet = new Set(requests.map((u) => u.username));
  const strangers = others.filter((u) => !friendSet.has(u.username) && !requestSet.has(u.username) && match(u));
  const activeUser = active ? byName.get(active) : null;

  return (
    <div id="friends-view">
      <div className="friends-layout">
        <div className="friends-list-col">
          <div className="fl-header">
            <span className="fl-title">Люди</span>
            <input className="fl-search" placeholder="Поиск..." aria-label="Поиск людей" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="fl-tabs">
              <button className={'fl-tab' + (tab === 'friends' ? ' on' : '')} onClick={() => setTab('friends')}>Друзья</button>
              <button className={'fl-tab' + (tab === 'all' ? ' on' : '')} onClick={() => setTab('all')}>Все</button>
            </div>
          </div>

          {loadFailed && (
            <div role="alert" style={{ padding: '8px 14px', fontSize: 12, color: 'var(--danger)' }}>
              Нет связи — список может быть устаревшим. Повторим автоматически.
            </div>
          )}

          <div className="fl-scroll">
            {tab === 'friends' ? (
              <>
                {requests.length > 0 && <div className="fl-section-lbl">Добавили тебя</div>}
                {requests.map((u) => renderRow(u, true, '+ В ответ'))}
                {friendList.length === 0 && requests.length === 0 && (
                  <div style={{ padding: '20px 14px', fontSize: 12, color: 'var(--text3)', textAlign: 'center' }}>
                    {q ? 'Не найдено' : 'Нет друзей'}
                  </div>
                )}
                {friendList.map((u) => renderRow(u, false))}
                {strangers.length > 0 && <div className="fl-section-lbl">Найти</div>}
                {strangers.map((u) => renderRow(u, true))}
              </>
            ) : (
              <>
                <div className="fl-section-lbl">Все пользователи</div>
                {others.filter(match).map((u) => renderRow(u, true))}
              </>
            )}
          </div>
        </div>

        {activeUser && friendSet.has(activeUser.username) ? (
          <ChatPane
            key={activeUser.username} friend={activeUser} online={online.has(activeUser.username)}
            mutual={followerSet.has(activeUser.username)}
            onRemoved={() => { setActive(null); setFriends((f) => f.filter((x) => x !== activeUser.username)); }}
          />
        ) : (
          <div className="friends-chat-col">
            <div className="chat-no-sel"><div className="chat-no-sel-icon">💬</div><div>Выбери друга слева</div></div>
          </div>
        )}
      </div>
    </div>
  );
}

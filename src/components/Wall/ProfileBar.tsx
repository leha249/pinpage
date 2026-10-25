import { useState } from 'react';
import type { User } from '../../types';
import { useApp } from '../../context/AppContext';
import { DB, uploadMedia } from '../../supabase';
import { pickFile } from '../../lib/pickFile';
import { safeColor } from '../../lib/safe';
import Avatar from '../Avatar';

interface Props {
  viewUser: User;
  isBanned: boolean;
  isOwner: boolean;
  isFriend: boolean;
  nearbyFriends: User[];
  editing: boolean;
  onToggleEdit: () => void;
  onFriendChange: () => void;
  onUserChange: (u: User) => void;
}

export default function ProfileBar({
  viewUser, isBanned, isOwner, isFriend, nearbyFriends, editing, onToggleEdit, onFriendChange, onUserChange,
}: Props) {
  const { navigateToWall, notify } = useApp();
  const [hover, setHover] = useState(false);
  const [busy, setBusy] = useState(false);
  const color = safeColor(viewUser.color);

  async function changeAvatar() {
    const file = await pickFile('image/*', 'image', (m) => notify(m, 'err'));
    if (!file) return;
    const res = await uploadMedia(file, 'avatars', viewUser.username, 'avatar');
    if (!res) { notify('Не удалось загрузить файл', 'err'); return; }
    // Меняем только аватарку — остальные поля профиля (bio, имя) сервер не трогает.
    if (!(await DB.updateProfile(viewUser.username, { avatarImg: res.url, avatarMediaId: res.id }))) {
      notify('Не удалось сохранить аватарку', 'err'); return;
    }
    onUserChange({ ...viewUser, avatarImg: res.url, avatarMediaId: res.id ?? undefined });
    notify('Аватарка обновлена');
  }

  async function toggleFriend() {
    if (busy) return;
    setBusy(true);
    try {
      if (isFriend) {
        if (!(await DB.removeFriend(viewUser.username))) { notify('Не удалось удалить из друзей', 'err'); return; }
        notify('Удалён из друзей');
      } else {
        if (!(await DB.addFriend(viewUser.username))) { notify('Не удалось добавить в друзья', 'err'); return; }
        notify('Добавлен! Написать друг другу можно, когда добавление станет взаимным.');
      }
      onFriendChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="profile-bar">
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `radial-gradient(ellipse at 0 50%, color-mix(in oklab, ${color} 10%, transparent) 0%, transparent 58%)` }} />

      <Avatar
        user={viewUser} size={44}
        onClick={isOwner ? changeAvatar : undefined}
        title={isOwner ? 'Сменить аватарку' : undefined}
      >
        {isOwner && (
          <div
            onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
            style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(0,0,0,.5)', color: '#fff', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: hover ? 1 : 0, transition: 'opacity .2s' }}
          >
            Изм.
          </div>
        )}
      </Avatar>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="pb-name">{viewUser.displayName}</span>
          {isBanned && <span className="pill pill-ban">ЗАБЛОКИРОВАН</span>}
        </div>
        <div className="pb-bio">@{viewUser.username}{viewUser.bio ? ' · ' + viewUser.bio : ''}</div>
      </div>

      <div className="pb-fnav">
        {nearbyFriends.map((f) => {
          const c = safeColor(f.color);
          return (
            <button
              key={f.username} className="pb-fav" title={f.displayName} aria-label={f.displayName}
              style={{ borderColor: c, color: c, background: `color-mix(in oklab, ${c} 15%, transparent)` }}
              onClick={() => navigateToWall(f.username)}
            >
              {f.avatar}
            </button>
          );
        })}
      </div>

      {isOwner ? (
        <button className={'btn' + (editing ? ' btn-accent' : '')} onClick={onToggleEdit}>
          {editing ? 'Режим правки' : 'Изменить'}
        </button>
      ) : (
        <button className="btn" disabled={busy} onClick={toggleFriend}>
          {isFriend ? 'В друзьях' : '+ Добавить в друзья'}
        </button>
      )}
    </div>
  );
}

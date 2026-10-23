import { useState } from 'react';
import type { User } from '../../types';
import { useApp } from '../../context/AppContext';
import { DB, uploadMedia } from '../../supabase';
import { pickFile } from '../../lib/pickFile';
import Avatar from '../Avatar';

interface Props {
  viewUser: User;
  isBanned: boolean;
  isOwner: boolean;
  isFriend: boolean;
  nearbyFriends: User[];
  onFriendChange: () => void;
  onUserChange: (u: User) => void;
}

export default function ProfileBar({ viewUser, isBanned, isOwner, isFriend, nearbyFriends, onFriendChange, onUserChange }: Props) {
  const { currentUser, editing, setEditing, navigateToWall, notify } = useApp();
  const [hover, setHover] = useState(false);
  const me = currentUser!;

  async function changeAvatar() {
    const file = await pickFile('image/*', 'image', (m) => notify(m, 'err'));
    if (!file) return;
    const res = await uploadMedia(file, 'avatars', viewUser.username, 'avatar');
    if (!res) { notify('Не удалось загрузить файл', 'err'); return; }
    const updated: User = { ...viewUser, avatarImg: res.url, avatarMediaId: res.id ?? undefined };
    if (!(await DB.setUser(viewUser.username, updated))) { notify('Не удалось сохранить аватарку', 'err'); return; }
    onUserChange(updated);
    notify('Аватарка обновлена');
  }

  async function toggleFriend() {
    if (isFriend) {
      if (!(await DB.removeFriend(me.username, viewUser.username))) { notify('Не удалось удалить из друзей', 'err'); return; }
      notify('Удалён из друзей');
    } else {
      if (!(await DB.addFriend(me.username, viewUser.username))) { notify('Не удалось добавить в друзья', 'err'); return; }
      notify('Добавлен!');
    }
    onFriendChange();
  }

  return (
    <div id="profile-bar">
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `radial-gradient(ellipse at 0 50%, color-mix(in oklab, ${viewUser.color} 10%, transparent) 0%, transparent 58%)` }} />

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
        {nearbyFriends.map((f) => (
          <button
            key={f.username} className="pb-fav" title={f.displayName}
            style={{ borderColor: f.color, color: f.color, background: `color-mix(in oklab, ${f.color} 15%, transparent)` }}
            onClick={() => navigateToWall(f.username)}
          >
            {f.avatar}
          </button>
        ))}
      </div>

      {isOwner ? (
        <button className={'btn' + (editing ? ' btn-accent' : '')} onClick={() => setEditing(!editing)}>
          {editing ? 'Режим правки' : 'Изменить'}
        </button>
      ) : (
        <button className="btn" onClick={toggleFriend}>
          {isFriend ? 'В друзьях' : '+ Добавить в друзья'}
        </button>
      )}
    </div>
  );
}

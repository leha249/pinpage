import { useEffect, useState } from 'react';
import type { AccountStats, User } from '../types';
import { useApp } from '../context/AppContext';
import { DB, uploadMedia } from '../supabase';
import { pickFile } from '../lib/pickFile';
import { fmtDateLabel } from '../lib/format';
import Avatar from './Avatar';
import Modal from './Modal';

export default function Settings() {
  const { currentUser, updateUser, theme, setTheme, notify, logout } = useApp();
  const me = currentUser!.username;

  const [user, setUser] = useState<User>(currentUser!);
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [displayName, setDisplayName] = useState(currentUser!.displayName);
  const [bio, setBio] = useState(currentUser!.bio);
  const [profErr, setProfErr] = useState('');
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [busy, setBusy] = useState<'' | 'profile' | 'pw' | 'delete'>('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    (async () => {
      const [fresh, st] = await Promise.all([DB.getUser(me), DB.getAccountStats(me)]);
      if (fresh) { setUser(fresh); setDisplayName(fresh.displayName); setBio(fresh.bio); }
      setStats(st);
    })();
  }, [me]);

  async function changeAvatar() {
    const file = await pickFile('image/*', 'image', (m) => notify(m, 'err'));
    if (!file) return;
    const res = await uploadMedia(file, 'avatars', me, 'avatar');
    if (!res) { notify('Не удалось загрузить файл', 'err'); return; }
    const updated = { ...user, avatarImg: res.url, avatarMediaId: res.id ?? undefined };
    if (!(await DB.setUser(me, updated))) { notify('Не удалось сохранить аватарку', 'err'); return; }
    setUser(updated); updateUser(updated);
    notify('Аватарка обновлена');
  }

  async function saveProfile() {
    const dn = displayName.trim();
    if (!dn) { setProfErr('Имя не может быть пустым'); return; }
    setProfErr(''); setBusy('profile');
    const updated = { ...user, displayName: dn, bio: bio.trim() };
    const ok = await DB.setUser(me, updated);
    setBusy('');
    if (!ok) { setProfErr('Не удалось сохранить. Попробуй ещё раз.'); return; }
    setUser(updated); updateUser(updated);
    notify('Профиль сохранён');
  }

  async function savePassword() {
    setPwErr('');
    if (!curPw || !newPw) { setPwErr('Заполни оба поля'); return; }
    if (newPw.length < 4) { setPwErr('Новый пароль минимум 4 символа'); return; }
    setBusy('pw');
    const latest = await DB.getUser(me);
    const ok = latest?.password === curPw;
    if (!latest || !ok) { setBusy(''); setPwErr('Текущий пароль неверен'); return; }
    const updated = { ...latest, password: newPw };
    const saved = await DB.setUser(me, updated);
    setBusy('');
    if (!saved) { setPwErr('Не удалось сохранить новый пароль. Попробуй ещё раз.'); return; }
    setCurPw(''); setNewPw('');
    notify('Пароль изменён');
  }

  async function exportData() {
    const [profile, wall, friends] = await Promise.all([DB.getUser(me), DB.getWall(me), DB.getFriends(me)]);
    const { password: _omit, ...safeProfile } = profile ?? ({} as User);
    const blob = new Blob([JSON.stringify({ profile: safeProfile, wall, friends, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `pinpage-${me}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    notify('Данные скачаны');
  }

  async function deleteAccount() {
    setBusy('delete');
    const ok = await DB.deleteUser(me);
    setBusy('');
    if (!ok) { notify('Не удалось удалить аккаунт. Попробуй ещё раз.', 'err'); return; }
    setConfirmDelete(false);
    logout();
    notify('Аккаунт удалён', 'err');
  }

  return (
    <div className="settings-wrap" style={{ animation: 'fadeUp .3s ease' }}>
      <div className="settings-header">Настройки</div>

      <div className="card settings-card">
        <div className="settings-card-title">Профиль</div>
        <div className="settings-card-sub">Как тебя видят другие</div>
        <div className="settings-avatar-row">
          <Avatar user={user} size={56} onClick={changeAvatar} title="Изменить аватарку" />
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>Нажми на аватарку, чтобы сменить фото</div>
        </div>
        <div className="settings-field">
          <label>Отображаемое имя</label>
          <input className="auth-input" value={displayName} maxLength={40} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="settings-field">
          <label>О себе</label>
          <textarea className="auth-input" style={{ minHeight: 60, resize: 'vertical' }} value={bio} maxLength={140} onChange={(e) => setBio(e.target.value)} />
        </div>
        {profErr && <div className="auth-err">{profErr}</div>}
        <button className="auth-btn" style={{ marginTop: 4 }} disabled={busy === 'profile'} onClick={saveProfile}>Сохранить профиль</button>
      </div>

      <div className="card settings-card">
        <div className="settings-card-title">Пароль</div>
        <div className="settings-card-sub">Смена пароля входа</div>
        <div className="settings-field">
          <label>Текущий пароль</label>
          <input className="auth-input" type="password" autoComplete="current-password" value={curPw} onChange={(e) => setCurPw(e.target.value)} />
        </div>
        <div className="settings-field">
          <label>Новый пароль</label>
          <input
            className="auth-input" type="password" autoComplete="new-password" value={newPw}
            onChange={(e) => setNewPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && savePassword()}
          />
        </div>
        {pwErr && <div className="auth-err">{pwErr}</div>}
        <button className="auth-btn" style={{ marginTop: 4 }} disabled={busy === 'pw'} onClick={savePassword}>Сменить пароль</button>
      </div>

      <div className="card settings-card">
        <div className="settings-card-title">Внешний вид</div>
        <div className="settings-card-sub">Тема оформления</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={'btn' + (theme === 'light' ? ' btn-accent' : '')} onClick={() => setTheme('light')}>Светлая</button>
          <button className={'btn' + (theme === 'dark' ? ' btn-accent' : '')} onClick={() => setTheme('dark')}>Тёмная</button>
        </div>
      </div>

      {stats && (
        <div className="card settings-card">
          <div className="settings-card-title">Аккаунт</div>
          <div className="settings-card-sub">На сайте с {fmtDateLabel(new Date(stats.created_at).getTime())}</div>
          <div className="settings-stats-grid">
            {[['Друзей', stats.friends_count], ['Файлов', stats.files_uploaded], ['Предупр.', stats.warnings_count]].map(([l, v]) => (
              <div className="settings-stat" key={l}>
                <div className="settings-stat-val">{v}</div>
                <div className="settings-stat-lbl">{l}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card settings-card">
        <div className="settings-card-title">Мои данные</div>
        <div className="settings-card-sub">Скачай копию профиля и стены в формате JSON</div>
        <button className="btn" onClick={exportData}>Скачать мои данные</button>
      </div>

      <div className="card settings-card settings-danger">
        <div className="settings-card-title">Опасная зона</div>
        <div className="settings-card-sub">Это действие нельзя отменить</div>
        <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>Удалить аккаунт</button>
      </div>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Удалить аккаунт?" width={380}>
        <p style={{ color: 'oklch(70% 0.19 25)', fontSize: 13, marginBottom: 18, lineHeight: 1.5 }}>
          Стена, друзья, сообщения и все файлы будут удалены навсегда. Отменить это будет нельзя.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={() => setConfirmDelete(false)}>Отмена</button>
          <button className="btn btn-danger" disabled={busy === 'delete'} onClick={deleteAccount}>
            {busy === 'delete' ? 'Удаляем...' : 'Удалить навсегда'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { ADMIN_USERNAME, type AccountStats, type User, type Warning } from '../types';
import { useApp } from '../context/AppContext';
import { DB, uploadMedia } from '../supabase';
import { pickFile } from '../lib/pickFile';
import { fmtDate, fmtDateLabel } from '../lib/format';
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
  const [delPw, setDelPw] = useState('');
  const [delErr, setDelErr] = useState('');
  const [warnings, setWarnings] = useState<Warning[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [fresh, st] = await Promise.all([DB.getUser(me), DB.getAccountStats(me)]);
        if (cancelled) return;
        if (fresh) { setUser(fresh); setDisplayName(fresh.displayName); setBio(fresh.bio); }
        setStats(st);
      } catch { /* показываем то, что уже есть */ }
      try { const w = await DB.getMyWarnings(); if (!cancelled) setWarnings(w); } catch { /* не критично */ }
    })();
    return () => { cancelled = true; };
  }, [me]);

  async function changeAvatar() {
    const file = await pickFile('image/*', 'image', (m) => notify(m, 'err'));
    if (!file) return;
    const res = await uploadMedia(file, 'avatars', me, 'avatar');
    if (!res) { notify('Не удалось загрузить файл', 'err'); return; }
    // Точечное обновление: меняем только аватарку, а не перезаписываем весь профиль устаревшей копией.
    if (!(await DB.updateProfile(me, { avatarImg: res.url, avatarMediaId: res.id }))) { notify('Не удалось сохранить аватарку', 'err'); return; }
    const updated = { ...user, avatarImg: res.url, avatarMediaId: res.id ?? undefined };
    setUser(updated); updateUser(updated);
    notify('Аватарка обновлена');
  }

  async function saveProfile() {
    const dn = displayName.trim();
    if (!dn) { setProfErr('Имя не может быть пустым'); return; }
    setProfErr(''); setBusy('profile');
    const updated = { ...user, displayName: dn, bio: bio.trim() };
    const ok = await DB.updateProfile(me, { displayName: dn, bio: bio.trim() });
    setBusy('');
    if (!ok) { setProfErr('Не удалось сохранить. Попробуй ещё раз.'); return; }
    setUser(updated); updateUser(updated);
    notify('Профиль сохранён');
  }

  async function savePassword() {
    setPwErr('');
    if (!curPw || !newPw) { setPwErr('Заполни оба поля'); return; }
    if (newPw.length < 6) { setPwErr('Новый пароль минимум 6 символов'); return; }
    setBusy('pw');
    const saved = await DB.changePassword(curPw, newPw); // сервер сам сверяет текущий пароль
    setBusy('');
    if (!saved) { setPwErr('Текущий пароль неверен'); return; }
    setCurPw(''); setNewPw('');
    notify('Пароль изменён');
  }

  async function exportData() {
    let data;
    try { data = await Promise.all([DB.getUser(me), DB.getWall(me), DB.getFriends(me)]); }
    catch { notify('Не удалось получить данные. Проверь соединение.', 'err'); return; }
    const [profile, wallData, friends] = data;
    const wall = wallData.blocks;
    const blob = new Blob([JSON.stringify({ profile, wall, friends, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `pinpage-${me}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    notify('Данные скачаны');
  }

  async function deleteAccount() {
    if (!delPw) { setDelErr('Введи пароль для подтверждения'); return; }
    setDelErr(''); setBusy('delete');
    const ok = await DB.deleteAccount(delPw); // сервер проверяет пароль и удаляет все данные одной операцией
    setBusy('');
    if (!ok) { setDelErr('Не удалось удалить аккаунт: проверь пароль и повтори попытку.'); return; }
    setConfirmDelete(false); setDelPw('');
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
          <label htmlFor="set-name">Отображаемое имя</label>
          <input id="set-name" className="auth-input" value={displayName} maxLength={40} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="settings-field">
          <label htmlFor="set-bio">О себе</label>
          <textarea id="set-bio" className="auth-input" style={{ minHeight: 60, resize: 'vertical' }} value={bio} maxLength={140} onChange={(e) => setBio(e.target.value)} />
        </div>
        {profErr && <div className="auth-err" role="alert">{profErr}</div>}
        <button className="auth-btn" style={{ marginTop: 4 }} disabled={busy === 'profile'} onClick={saveProfile}>Сохранить профиль</button>
      </div>

      <div className="card settings-card">
        <div className="settings-card-title">Пароль</div>
        <div className="settings-card-sub">Смена пароля входа</div>
        <div className="settings-field">
          <label htmlFor="set-cur-pw">Текущий пароль</label>
          <input id="set-cur-pw" maxLength={200} className="auth-input" type="password" autoComplete="current-password" value={curPw} onChange={(e) => setCurPw(e.target.value)} />
        </div>
        <div className="settings-field">
          <label htmlFor="set-new-pw">Новый пароль</label>
          <input
            id="set-new-pw" maxLength={200} className="auth-input" type="password" autoComplete="new-password" value={newPw}
            onChange={(e) => setNewPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && savePassword()}
          />
        </div>
        {pwErr && <div className="auth-err" role="alert">{pwErr}</div>}
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
          <div className="settings-card-sub">На сайте с {fmtDate(new Date(stats.created_at).getTime())}</div>
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

      {warnings.length > 0 && (
        <div className="card settings-card">
          <div className="settings-card-title">Предупреждения администрации</div>
          <div className="settings-card-sub">Их оставили за нарушение правил</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {warnings.map((w, i) => (
              <div key={i} style={{ fontSize: 'var(--fs-sm)', overflowWrap: 'anywhere' }}>
                <span style={{ color: 'var(--text3)', marginRight: 8 }}>{fmtDateLabel(w.at)}</span>{w.text}
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
        {me === ADMIN_USERNAME
          ? <div style={{ fontSize: 12, color: 'var(--text3)' }}>Аккаунт администратора удалить нельзя.</div>
          : <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>Удалить аккаунт</button>}
      </div>

      <Modal open={confirmDelete} onClose={() => { setConfirmDelete(false); setDelPw(''); setDelErr(''); }} title="Удалить аккаунт?" width={380}>
        <p style={{ color: 'oklch(70% 0.19 25)', fontSize: 13, marginBottom: 14, lineHeight: 1.5 }}>
          Профиль, стена, друзья и сообщения будут удалены сразу и навсегда. Загруженные файлы
          исчезнут из хранилища при его очистке. Отменить это будет нельзя.
        </p>
        <div className="settings-field">
          <label htmlFor="set-del-pw">Пароль для подтверждения</label>
          <input
            id="set-del-pw" className="auth-input" type="password" autoComplete="current-password" maxLength={200}
            value={delPw} onChange={(e) => setDelPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && deleteAccount()}
          />
        </div>
        {delErr && <div className="auth-err" role="alert" style={{ marginBottom: 12 }}>{delErr}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={() => { setConfirmDelete(false); setDelPw(''); setDelErr(''); }}>Отмена</button>
          <button className="btn btn-danger" disabled={busy === 'delete'} onClick={deleteAccount}>
            {busy === 'delete' ? 'Удаляем...' : 'Удалить навсегда'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Ban, User, Warning } from '../../types';
import { ADMIN_USERNAME } from '../../types';
import { useApp } from '../../context/AppContext';
import { DB, uploadMedia } from '../../supabase';
import { fmtTime } from '../../lib/format';
import Avatar from '../Avatar';
import Modal from '../Modal';

type ModalState =
  | { kind: 'ban'; user: User }
  | { kind: 'warn'; user: User }
  | { kind: 'edit'; user: User }
  | { kind: 'delete'; user: User }
  | null;

export default function AdminPanel() {
  const { navigateToWall, notify } = useApp();
  const [users, setUsers] = useState<User[] | null>(null);
  const [bans, setBans] = useState<Record<string, Ban>>({});
  const [warnCounts, setWarnCounts] = useState<Record<string, number>>({});
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<ModalState>(null);

  const load = useCallback(async () => {
    const [u, b] = await Promise.all([DB.getAllUsers(), DB.getAllBans()]);
    const counts: Record<string, number> = {};
    await Promise.all(u.map(async (x) => { counts[x.username] = (await DB.getWarnings(x.username)).length; }));
    setUsers(u); setBans(b); setWarnCounts(counts);
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (users || []).filter((u) => u.username !== ADMIN_USERNAME && (!q || (u.username + u.displayName).toLowerCase().includes(q)));
  }, [users, query]);

  const close = () => setModal(null);

  async function unban(u: User) {
    if (!(await DB.removeBan(u.username))) { notify('Не удалось снять бан', 'err'); return; }
    notify('Бан снят с @' + u.username); load();
  }

  if (!users) return <div id="loading-screen"><div className="loader" /><p>Загружаем панель...</p></div>;

  const banCount = Object.keys(bans).length;
  const warnTotal = Object.values(warnCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="admin-wrap" style={{ animation: 'fadeUp .3s ease' }}>
      <div className="admin-title">Админ-панель</div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 22 }}>{users.length} пользователей · {banCount} банов</div>

      <div className="stats-grid">
        {[['Пользователей', users.length], ['Заблокировано', banCount], ['Предупреждений', warnTotal], ['Активных', users.length - banCount]].map(([l, v]) => (
          <div className="stat-card" key={l}><div className="stat-val">{v}</div><div className="stat-lbl">{l}</div></div>
        ))}
      </div>

      <input className="admin-search" placeholder="Поиск по username или имени..." value={query} onChange={(e) => setQuery(e.target.value)} />

      <div className="admin-table-wrap">
        <div className="admin-table">
          <div className="admin-table-head">
            <div>Пользователь</div><div>Имя</div><div>Статус</div><div>Варны</div><div>Действия</div>
          </div>
          {rows.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>Ничего не найдено</div>}
          {rows.map((u) => {
            const banned = !!bans[u.username];
            const wc = warnCounts[u.username] || 0;
            return (
              <div key={u.username} className={'admin-table-row' + (banned ? ' banned' : '')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Avatar user={u} size={28} />
                  <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>@{u.username}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text2)' }}>{u.displayName}</div>
                <div><span className={'pill ' + (banned ? 'pill-ban' : 'pill-ok')}>{banned ? 'БАН' : 'OK'}</span></div>
                <div style={{ fontSize: 12, color: wc ? 'var(--warn)' : 'var(--text3)', fontWeight: wc ? 700 : 400 }}>{wc ? '! ' + wc : '—'}</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  <button className="ab" style={{ color: 'var(--accent)', borderColor: 'var(--border2)' }} onClick={() => navigateToWall(u.username)}>Стена</button>
                  <button className="ab" style={{ color: 'var(--accent2)', borderColor: 'var(--border2)' }} onClick={() => navigateToWall(u.username, { edit: true, adminAs: u.username })}>Ред. стену</button>
                  <button className="ab" style={{ color: 'var(--warn)', borderColor: 'var(--border2)' }} onClick={() => setModal({ kind: 'warn', user: u })}>Варн</button>
                  {banned
                    ? <button className="ab" style={{ color: 'var(--ok)', borderColor: 'var(--border2)' }} onClick={() => unban(u)}>Разбан</button>
                    : <button className="ab" style={{ color: 'var(--danger)', borderColor: 'var(--border2)' }} onClick={() => setModal({ kind: 'ban', user: u })}>Бан</button>}
                  <button className="ab" style={{ color: 'var(--text2)', borderColor: 'var(--border2)' }} onClick={() => setModal({ kind: 'edit', user: u })}>Профиль</button>
                  <button className="ab" style={{ color: 'var(--danger)', borderColor: 'var(--border2)' }} onClick={() => setModal({ kind: 'delete', user: u })}>Удалить</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {modal?.kind === 'ban' && <BanModal user={modal.user} onClose={close} onDone={() => { close(); load(); }} />}
      {modal?.kind === 'warn' && <WarnModal user={modal.user} onClose={close} onDone={() => { close(); load(); }} />}
      {modal?.kind === 'edit' && <EditModal user={modal.user} onClose={close} onDone={() => { close(); load(); }} />}
      {modal?.kind === 'delete' && <DeleteModal user={modal.user} onClose={close} onDone={() => { close(); load(); }} />}
    </div>
  );
}

interface MProps { user: User; onClose: () => void; onDone: () => void }

function BanModal({ user, onClose, onDone }: MProps) {
  const { notify } = useApp();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  async function confirm() {
    setBusy(true);
    const ok = await DB.setBan(user.username, reason.trim() || 'Нарушение правил');
    setBusy(false);
    if (!ok) { notify('Не удалось заблокировать пользователя', 'err'); return; }
    notify('Пользователь @' + user.username + ' заблокирован', 'err'); onDone();
  }
  return (
    <Modal open onClose={onClose} title={'Заблокировать @' + user.username}>
      <p style={{ color: 'var(--text3)', fontSize: 12, marginBottom: 14 }}>Пользователь не сможет войти до снятия бана.</p>
      <input className="auth-input" autoFocus placeholder="Причина бана..." value={reason}
        onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && confirm()} style={{ marginBottom: 14 }} />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>Отмена</button>
        <button className="btn btn-danger" disabled={busy} onClick={confirm}>Заблокировать</button>
      </div>
    </Modal>
  );
}

function WarnModal({ user, onClose, onDone }: MProps) {
  const { notify } = useApp();
  const [history, setHistory] = useState<Warning[]>([]);
  const [text, setText] = useState('');
  useEffect(() => { DB.getWarnings(user.username).then(setHistory); }, [user.username]);

  async function send() {
    if (!text.trim()) return;
    if (!(await DB.addWarning(user.username, text.trim()))) { notify('Не удалось отправить предупреждение', 'err'); return; }
    notify('Предупреждение отправлено @' + user.username); onDone();
  }
  async function clear() {
    if (!(await DB.clearWarnings(user.username))) { notify('Не удалось сбросить предупреждения', 'err'); return; }
    notify('Варны сброшены'); onDone();
  }
  return (
    <Modal open onClose={onClose} title={'Предупреждение: @' + user.username}>
      {history.length > 0 && (
        <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p style={{ fontSize: 11, color: 'var(--text3)' }}>Предыдущие предупреждения:</p>
          {history.map((w, i) => (
            <div key={i} style={{ padding: '8px 12px', borderRadius: 7, background: 'var(--bg3)', border: '1px solid var(--border)', fontSize: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>{w.text}</div>
              <div style={{ color: 'var(--text3)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>{fmtTime(w.at)}</div>
            </div>
          ))}
        </div>
      )}
      <textarea className="auth-input" style={{ height: 80, resize: 'vertical', marginBottom: 14 }} placeholder="Текст предупреждения..." value={text} onChange={(e) => setText(e.target.value)} />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>Отмена</button>
        {history.length > 0 && <button className="btn" onClick={clear}>Сбросить все</button>}
        <button className="btn btn-accent" onClick={send}>Отправить</button>
      </div>
    </Modal>
  );
}

function EditModal({ user, onClose, onDone }: MProps) {
  const { notify } = useApp();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [avatar, setAvatar] = useState(user.avatar);
  const [color, setColor] = useState(user.color);
  const [bio, setBio] = useState(user.bio);
  const [pw, setPw] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const updated: User = {
      ...user, displayName: displayName.trim() || user.displayName,
      avatar: avatar.trim()[0] || user.avatar, color: color.trim() || user.color, bio: bio.trim(),
    };
    if (pw) updated.password = pw;
    if (file) {
      const res = await uploadMedia(file, 'avatars', user.username, 'avatar');
      if (res) { updated.avatarImg = res.url; updated.avatarMediaId = res.id ?? undefined; }
    }
    const ok = await DB.setUser(user.username, updated);
    setBusy(false);
    if (!ok) { notify('Не удалось сохранить профиль @' + user.username, 'err'); return; }
    notify('Профиль @' + user.username + ' обновлён'); onDone();
  }

  const field = (label: string, el: React.ReactNode) => (
    <div className="settings-field"><label>{label}</label>{el}</div>
  );
  return (
    <Modal open onClose={onClose} title={'Редактировать @' + user.username}>
      {field('Аватар-фото', <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ fontSize: 12, color: 'var(--text)' }} />)}
      {field('Отображаемое имя', <input className="auth-input" value={displayName} maxLength={40} onChange={(e) => setDisplayName(e.target.value)} />)}
      {field('Аватар (1 символ)', <input className="auth-input" value={avatar} maxLength={2} onChange={(e) => setAvatar(e.target.value)} />)}
      {field('Цвет (hex)', <input className="auth-input" value={color} onChange={(e) => setColor(e.target.value)} />)}
      {field('Bio', <input className="auth-input" value={bio} maxLength={140} onChange={(e) => setBio(e.target.value)} />)}
      {field('Новый пароль (оставь пустым, чтобы не менять)', <input className="auth-input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />)}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
        <button className="btn" onClick={onClose}>Отмена</button>
        <button className="btn btn-accent" disabled={busy} onClick={save}>Сохранить</button>
      </div>
    </Modal>
  );
}

function DeleteModal({ user, onClose, onDone }: MProps) {
  const { notify } = useApp();
  const [busy, setBusy] = useState(false);
  async function confirm() {
    setBusy(true);
    const ok = await DB.deleteUser(user.username);
    setBusy(false);
    if (!ok) { notify('Не удалось удалить @' + user.username + '. Проверь права доступа в базе.', 'err'); return; }
    notify('Аккаунт @' + user.username + ' удалён', 'err'); onDone();
  }
  return (
    <Modal open onClose={onClose} title={'Удалить @' + user.username}>
      <p style={{ color: 'oklch(70% 0.19 25)', fontSize: 13, marginBottom: 18 }}>
        Это действие нельзя отменить. Все данные пользователя, его стена и список друзей будут удалены навсегда.
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>Отмена</button>
        <button className="btn btn-danger" disabled={busy} onClick={confirm}>{busy ? 'Удаляем...' : 'Удалить навсегда'}</button>
      </div>
    </Modal>
  );
}

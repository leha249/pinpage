import { useEffect, useState } from 'react';
import type { ChangelogEntry } from '../types';
import { ADMIN_USERNAME } from '../types';
import { useApp } from '../context/AppContext';
import { DB } from '../supabase';
import { fmtDateLabel } from '../lib/format';

export default function Changelog() {
  const { currentUser, notify } = useApp();
  const isAdmin = currentUser?.username === ADMIN_USERNAME;
  const [entries, setEntries] = useState<ChangelogEntry[] | null>(null);
  const [version, setVersion] = useState('');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const list = await DB.getChangelog();
    setEntries(list);
    if (list.length) localStorage.setItem('pp_changelog_seen', String(list[0].at)); // гасит точку в навигации
  }
  useEffect(() => { load(); }, []);

  async function publish() {
    if (!version.trim() || !title.trim()) { notify('Укажи версию и заголовок', 'err'); return; }
    setBusy(true);
    const ok = await DB.addChangelogEntry(version.trim(), title.trim(), desc.trim(), currentUser!.username);
    setBusy(false);
    if (!ok) { notify('Не удалось добавить запись', 'err'); return; }
    notify('Запись добавлена');
    setVersion(''); setTitle(''); setDesc('');
    load();
  }

  if (!entries) return <div id="loading-screen"><div className="loader" /><p>Загружаем...</p></div>;

  return (
    <div className="cl-wrap" style={{ animation: 'fadeUp .3s ease' }}>
      <div className="cl-header">Обновления</div>
      <div className="cl-sub">что изменилось в PinPage со временем</div>

      {isAdmin && (
        <div className="card cl-add-box">
          <div className="settings-card-title">Новая запись</div>
          <div className="cl-add-row">
            <input className="auth-input" style={{ maxWidth: 140 }} placeholder="Версия, напр. 1.6" value={version} onChange={(e) => setVersion(e.target.value)} />
            <input className="auth-input" placeholder="Заголовок" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <textarea className="auth-input" style={{ minHeight: 70, resize: 'vertical', marginBottom: 10 }} placeholder="Описание изменений..." value={desc} onChange={(e) => setDesc(e.target.value)} />
          <button className="auth-btn" style={{ marginTop: 0 }} disabled={busy} onClick={publish}>Опубликовать</button>
        </div>
      )}

      {entries.length === 0 && <div style={{ color: 'var(--text3)', fontSize: 13, padding: '20px 0' }}>Пока пусто.</div>}

      {entries.map((e, i) => (
        <div className="cl-entry" key={e.id}>
          <div className="cl-dot-col">
            <div className="cl-dot" />
            {i < entries.length - 1 && <div className="cl-line" />}
          </div>
          <div className="cl-body">
            <div className="cl-top-row">
              <span className="cl-version">v{e.version}</span>
              <span className="cl-title">{e.title}</span>
              <span className="cl-date">{fmtDateLabel(e.at)}</span>
            </div>
            {e.description && <div className="cl-desc">{e.description}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

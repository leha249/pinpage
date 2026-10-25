import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, User } from '../../types';
import { useApp } from '../../context/AppContext';
import { DB, uploadMedia } from '../../supabase';
import { pickFile } from '../../lib/pickFile';
import { fileKind } from '../../lib/fileKinds';
import { fmtDateLabel, fmtTime } from '../../lib/format';
import { openLightbox } from '../Lightbox';
import Avatar from '../Avatar';

interface Props {
  friend: User;
  online: boolean;
  /** Друг добавил меня в ответ — только тогда сервер разрешает переписку. */
  mutual: boolean;
  onRemoved: () => void;
}

const PAGE = 300;      // сколько последних сообщений показываем за раз
const POLL_MS = 4_000; // как часто проверяем новые сообщения, пока чат открыт

export default function ChatPane({ friend, online, mutual, onRemoved }: Props) {
  const { currentUser, navigateToWall, notify } = useApp();
  const me = currentUser!.username;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [limit, setLimit] = useState(PAGE);
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const seq = useRef(0); // номер запроса: ответ устаревшего запроса не должен затирать свежий

  const load = useCallback(async () => {
    const id = ++seq.current;
    try {
      const msgs = await DB.getMessages(friend.username, limit);
      if (id !== seq.current) return;
      setMessages(msgs);
      setLoadFailed(false);
      // «Прочитано» — только если человек реально смотрит на чат и есть что отмечать.
      if (document.visibilityState !== 'hidden' && msgs.some((m) => m.from !== me && !m.read)) {
        void DB.markRead(friend.username);
      }
    } catch {
      if (id === seq.current) setLoadFailed(true);
    }
  }, [me, friend.username, limit]);

  useEffect(() => {
    void load();
    // Realtime по таблице сообщений убран (он раздавал бы чужую переписку всем) — обычный опрос.
    const poll = window.setInterval(() => { if (document.visibilityState !== 'hidden') void load(); }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { seq.current++; window.clearInterval(poll); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

  // Автопрокрутка вниз, только если пользователь и так был внизу
  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function onScroll() {
    const el = listRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }

  async function send() {
    const t = text.trim();
    if (!t || sending || !mutual) return;
    setSending(true);
    const ok = editingId !== null
      ? await DB.editMessage(editingId, t)
      : await DB.sendMessage(friend.username, { text: t });
    setSending(false);
    if (!ok) { notify(editingId !== null ? 'Не удалось изменить сообщение' : 'Не удалось отправить сообщение', 'err'); return; }
    setText(''); setEditingId(null);
    stickToBottom.current = true;
    void load();
  }

  async function sendMedia() {
    if (!mutual) return;
    // Лимит размера выбирается по настоящему типу файла (картинка — 10 МБ, видео — 50 МБ).
    const file = await pickFile('image/*,video/*', ['image', 'video'], (m) => notify(m, 'err'));
    if (!file) return;
    setSending(true); setUploading(true);
    const res = await uploadMedia(file, 'chat', me, 'chat');
    setUploading(false);
    if (!res) { setSending(false); notify('Не удалось загрузить файл', 'err'); return; }
    const ok = await DB.sendMessage(friend.username, {
      mediaUrl: res.url, mediaType: fileKind(file) === 'video' ? 'video' : 'image', mediaId: res.id,
    });
    setSending(false);
    if (!ok) { notify('Не удалось отправить файл', 'err'); return; }
    stickToBottom.current = true;
    void load();
  }

  async function remove(id: number) {
    if (!(await DB.deleteMessage(id))) { notify('Не удалось удалить сообщение', 'err'); return; }
    void load();
  }

  async function removeFriend() {
    if (!(await DB.removeFriend(friend.username))) { notify('Не удалось удалить из друзей', 'err'); return; }
    notify('Удалён из друзей');
    onRemoved();
  }

  async function copy(t: string) {
    try { await navigator.clipboard.writeText(t); notify('Скопировано'); }
    catch { notify('Не удалось скопировать', 'err'); }
  }

  let lastLabel: string | null = null;

  return (
    <div className="friends-chat-col">
      <div className="chat-header">
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Avatar user={friend} size={34} />
          {online && <span className="online-dot" />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="chat-header-name">{friend.displayName}</div>
          <div className="chat-header-status">
            @{friend.username}{friend.bio ? ' · ' + friend.bio : ''}
            {mutual && <span className="mutual-badge">взаимно</span>}
          </div>
        </div>
        <button className="btn" onClick={() => navigateToWall(friend.username)}>Стена →</button>
        <button className="btn btn-danger" onClick={removeFriend}>Удалить</button>
      </div>

      {editingId !== null && (
        <div className="chat-edit-bar visible">
          <span>Редактирование сообщения</span>
          <button className="chat-edit-cancel" aria-label="Отменить редактирование" onClick={() => { setEditingId(null); setText(''); }}>✕</button>
        </div>
      )}

      {!mutual && (
        <div role="note" style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text3)', borderBottom: '1px solid var(--border)' }}>
          Переписка откроется, когда {friend.displayName} добавит тебя в друзья в ответ.
        </div>
      )}
      {loadFailed && (
        <div role="alert" style={{ padding: '6px 14px', fontSize: 12, color: 'var(--danger)' }}>
          Нет связи — сообщения могут быть неактуальны. Повторим автоматически.
        </div>
      )}

      <div className="chat-messages" ref={listRef} onScroll={onScroll}>
        {messages.length >= limit && (
          <button className="btn" style={{ alignSelf: 'center', margin: '8px 0' }} onClick={() => { stickToBottom.current = false; setLimit((l) => l + PAGE); }}>
            Показать более ранние сообщения
          </button>
        )}
        {messages.length === 0 && (
          <div className="chat-empty"><div className="chat-empty-icon">💬</div><div>{mutual ? 'Напиши первым!' : 'Пока пусто'}</div></div>
        )}
        {messages.map((m) => {
          const mine = m.from === me;
          const label = fmtDateLabel(m.at);
          const showSep = label !== lastLabel;
          lastLabel = label;
          return (
            <div key={m.id} style={{ display: 'contents' }}>
              {showSep && <div className="chat-date-sep">{label}</div>}
              <div className={'msg-row ' + (mine ? 'mine' : 'theirs')}>
                {!mine && <Avatar user={friend} size={26} />}
                <div className="msg-col">
                  <div className="msg-bubble">
                    {m.text}
                    {m.mediaUrl && (m.mediaType === 'video'
                      ? <video src={m.mediaUrl} controls />
                      : <img src={m.mediaUrl} alt="Изображение из чата" onClick={() => openLightbox(m.mediaUrl!)} />)}
                  </div>
                  <div className="msg-meta">
                    <span className="msg-time">{fmtTime(m.at)}</span>
                    {m.edited && <span className="msg-edited">(ред.)</span>}
                    <div className="msg-actions">
                      {m.text && <button className="msg-action-btn" onClick={() => copy(m.text!)}>Копир.</button>}
                      {mine && m.text && (
                        <button className="msg-action-btn" onClick={() => { setEditingId(m.id); setText(m.text!); }}>Ред.</button>
                      )}
                      {mine && <button className="msg-action-btn del" onClick={() => remove(m.id)}>Удал.</button>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {uploading && <div role="status" className="chat-sending" style={{ padding: '4px 14px', fontSize: 12, color: 'var(--text3)' }}>Загружаем файл…</div>}

      <div className="chat-input-row">
        <div className="chat-inp-wrap">
          <textarea
            className="chat-inp" rows={1} maxLength={2000} value={text} disabled={!mutual}
            placeholder={mutual ? 'Сообщение...' : 'Переписка пока закрыта'} aria-label="Сообщение"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // isComposing: Enter, которым подтверждают ввод через IME, не должен отправлять сообщение
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); }
              if (e.key === 'Escape' && editingId !== null) { setEditingId(null); setText(''); }
            }}
          />
          <button className="chat-media-btn" title="Фото / Видео" aria-label="Прикрепить фото или видео" disabled={!mutual} onClick={sendMedia}>📎</button>
        </div>
        <button className="chat-send" disabled={sending || !mutual} aria-label="Отправить" onClick={() => void send()}>↑</button>
      </div>
    </div>
  );
}

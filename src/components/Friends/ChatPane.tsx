import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, User } from '../../types';
import { useApp } from '../../context/AppContext';
import { DB, supabase, uploadMedia } from '../../supabase';
import { pickFile } from '../../lib/pickFile';
import { fmtDateLabel, fmtTime } from '../../lib/format';
import { openLightbox } from '../Lightbox';
import Avatar from '../Avatar';

interface Props {
  friend: User;
  online: boolean;
  onRemoved: () => void;
}

export default function ChatPane({ friend, online, onRemoved }: Props) {
  const { currentUser, navigateToWall, notify } = useApp();
  const me = currentUser!.username;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [mutual, setMutual] = useState(false);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const load = useCallback(async () => {
    const msgs = await DB.getMessages(me, friend.username);
    setMessages(msgs);
    DB.markRead(me, friend.username); // чат открыт — входящие считаются прочитанными
  }, [me, friend.username]);

  useEffect(() => {
    setMessages([]); setText(''); setEditingId(null);
    load();
    DB.getMutualFriends(me).then((s) => setMutual(s.has(friend.username)));

    // Realtime: любое изменение в паре me<->friend → перезагрузка.
    const ch = supabase
      .channel(`chat-${me}-${friend.username}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (p) => {
        const row = (p.new && Object.keys(p.new).length ? p.new : p.old) as { from_user?: string; to_user?: string };
        const pair = (row.from_user === me && row.to_user === friend.username)
          || (row.from_user === friend.username && row.to_user === me);
        if (pair) load();
      })
      .subscribe();
    // Страховка на случай обрыва сокета — редкий опрос.
    const poll = window.setInterval(load, 20_000);
    return () => { supabase.removeChannel(ch); window.clearInterval(poll); };
  }, [me, friend.username, load]);

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
    if (!t || sending) return;
    setSending(true);
    const ok = editingId !== null
      ? await DB.editMessage(editingId, t)
      : await DB.sendMessage(me, friend.username, { text: t });
    setSending(false);
    if (!ok) { notify(editingId !== null ? 'Не удалось изменить сообщение' : 'Не удалось отправить сообщение', 'err'); return; }
    setText(''); setEditingId(null);
    stickToBottom.current = true;
    load();
  }

  async function sendMedia() {
    const file = await pickFile('image/*,video/*', 'video', (m) => notify(m, 'err'));
    if (!file) return;
    setSending(true);
    const res = await uploadMedia(file, 'chat', me, 'chat');
    if (!res) { setSending(false); notify('Не удалось загрузить файл', 'err'); return; }
    const ok = await DB.sendMessage(me, friend.username, {
      mediaUrl: res.url, mediaType: file.type.startsWith('video/') ? 'video' : 'image', mediaId: res.id,
    });
    setSending(false);
    if (!ok) { notify('Не удалось отправить файл', 'err'); return; }
    stickToBottom.current = true;
    load();
  }

  async function remove(id: number) {
    if (!(await DB.deleteMessage(id))) { notify('Не удалось удалить сообщение', 'err'); return; }
    load();
  }

  async function removeFriend() {
    if (!(await DB.removeFriend(me, friend.username))) { notify('Не удалось удалить из друзей', 'err'); return; }
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
          <button className="chat-edit-cancel" onClick={() => { setEditingId(null); setText(''); }}>✕</button>
        </div>
      )}

      <div className="chat-messages" ref={listRef} onScroll={onScroll}>
        {messages.length === 0 && (
          <div className="chat-empty"><div className="chat-empty-icon">💬</div><div>Напиши первым!</div></div>
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
                      : <img src={m.mediaUrl} alt="" onClick={() => openLightbox(m.mediaUrl!)} />)}
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

      <div className="chat-input-row">
        <div className="chat-inp-wrap">
          <textarea
            className="chat-inp" rows={1} maxLength={2000} placeholder="Сообщение..." value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
              if (e.key === 'Escape' && editingId !== null) { setEditingId(null); setText(''); }
            }}
          />
          <button className="chat-media-btn" title="Фото / Видео" onClick={sendMedia}>📎</button>
        </div>
        <button className="chat-send" disabled={sending} onClick={send}>↑</button>
      </div>
    </div>
  );
}

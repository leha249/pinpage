import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ADMIN_USERNAME, MAX_FILE_MB, type BlockType, type User, type WallBlock, type BlockReaction } from '../../types';
import { DB, uploadMedia } from '../../supabase';
import { pickFile } from '../../lib/pickFile';
import { fileKind } from '../../lib/fileKinds';
import { safeColor } from '../../lib/safe';
import { stopAllMedia } from '../../hooks/useMediaPlayback';
import { cloneBlocks, DEFAULT_SIZE, newBlockId, randomSpot } from './wallGeometry';
import ProfileBar from './ProfileBar';
import EditToolbar from './EditToolbar';
import Block from './Block';
import Modal from '../Modal';

export default function Wall() {
  const { currentUser, updateUser, viewingUser, editing, setEditing, adminEditingAs, setAdminEditingAs, setTab, notify } = useApp();
  const me = currentUser!;
  const vu = viewingUser || me.username;

  const [viewUser, setViewUser] = useState<User | null>(null);
  const [blocks, setBlocks] = useState<WallBlock[]>([]);
  const [reactions, setReactions] = useState<Record<string, BlockReaction[]>>({});
  const [friends, setFriends] = useState<string[]>([]);
  const [nearby, setNearby] = useState<User[]>([]);
  const [banned, setBanned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [askLeave, setAskLeave] = useState(false);
  const [conflict, setConflict] = useState(false);

  // Версия стены с сервера и снимок «как сохранено» — для проверки конфликтов и несохранённых правок.
  const versionRef = useRef<string | null>(null);
  const savedRef = useRef('[]');
  const reqRef = useRef(0);

  const isOwner = vu === me.username || adminEditingAs === vu;
  const canEdit = editing && isOwner && !loadError;
  const dirty = useMemo(() => canEdit && JSON.stringify(blocks) !== savedRef.current, [blocks, canEdit]);

  const loadNearby = useCallback(async (myFriends: string[], theirFriends: string[]) => {
    const ids = [...new Set([...myFriends, ...theirFriends])].filter((f) => f !== vu).slice(0, 6);
    const users = await Promise.all(ids.map((id) => DB.getUser(id).catch(() => null)));
    return users.filter((x): x is User => !!x);
  }, [vu]);

  const load = useCallback(async () => {
    const id = ++reqRef.current; // ответы устаревших запросов (быстрая смена стены) отбрасываем
    setLoading(true);
    setLoadError(false);
    try {
      const [u, wall, myFriends, vFriends, isBanned] = await Promise.all([
        DB.getUser(vu), DB.getWall(vu), DB.getFriends(me.username), DB.getFriends(vu), DB.isBanned(vu),
      ]);
      if (id !== reqRef.current) return;
      const fresh = cloneBlocks(wall.blocks);
      versionRef.current = wall.version;
      savedRef.current = JSON.stringify(fresh);
      setViewUser(u);
      setBlocks(fresh);
      setFriends(myFriends);
      setBanned(isBanned);
      let rx: Record<string, BlockReaction[]> = {};
      if (fresh.length) { try { rx = await DB.getBlockReactions(fresh.map((b) => b.id)); } catch { /* реакции не критичны */ } }
      const near = await loadNearby(myFriends, vFriends);
      if (id !== reqRef.current) return;
      setReactions(rx);
      setNearby(near);
    } catch {
      if (id !== reqRef.current) return;
      setLoadError(true);
    } finally {
      if (id === reqRef.current) setLoading(false);
    }
  }, [vu, me.username, loadNearby]);

  useEffect(() => { void load(); return () => { reqRef.current++; }; }, [load]);

  // После (до)бавления/удаления друга обновляем только друзей — без перезагрузки всей стены.
  const reloadFriends = useCallback(async () => {
    try {
      const [mine, theirs] = await Promise.all([DB.getFriends(me.username), DB.getFriends(vu)]);
      setFriends(mine);
      setNearby(await loadNearby(mine, theirs));
    } catch { notify('Не удалось обновить список друзей', 'err'); }
  }, [me.username, vu, loadNearby, notify]);

  // Остановить звук при уходе со стены / смене стены
  useEffect(() => () => stopAllMedia(), [vu]);

  // Предупреждение при закрытии вкладки — только если есть несохранённые правки
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  // ── Операции над блоками ──
  const change = useCallback((id: string, patch: Partial<WallBlock>) => {
    setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }, []);
  const remove = useCallback((id: string) => setBlocks((bs) => bs.filter((b) => b.id !== id)), []);
  const duplicate = useCallback((id: string) => {
    setBlocks((bs) => {
      const src = bs.find((b) => b.id === id);
      if (!src) return bs;
      const clone: WallBlock = { ...JSON.parse(JSON.stringify(src)), id: newBlockId(), x: src.x + 24, y: src.y + 24 };
      return [...bs, clone];
    });
  }, []);
  const reorder = useCallback((id: string, dir: 'up' | 'down') => {
    setBlocks((bs) => {
      const i = bs.findIndex((b) => b.id === id);
      const j = dir === 'up' ? i + 1 : i - 1;
      if (i < 0 || j < 0 || j >= bs.length) return bs;
      const copy = bs.slice();
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }, []);

  const toggleReaction = useCallback(async (blockId: string, emoji: string) => {
    const before = reactions[blockId] || [];
    const removing = before.find((r) => r.username === me.username)?.emoji === emoji;
    // Оптимистичное обновление UI; при ошибке сервера возвращаем как было.
    setReactions((map) => {
      const others = (map[blockId] || []).filter((r) => r.username !== me.username);
      return { ...map, [blockId]: removing ? others : others.concat({ blockId, username: me.username, emoji }) };
    });
    const done = removing ? await DB.removeReaction(blockId) : await DB.setReaction(blockId, emoji);
    if (!done) {
      setReactions((map) => ({ ...map, [blockId]: before }));
      notify('Не удалось сохранить реакцию', 'err');
    }
  }, [reactions, me.username, notify]);

  const addBlockFromFile = useCallback(async (type: BlockType, file: File, at?: { x: number; y: number }) => {
    const cfg = {
      image: { folder: 'wall-images', kind: 'wall_image' as const, label: 'изображение' },
      video: { folder: 'wall-video', kind: 'wall_video' as const, label: 'видео' },
      music: { folder: 'wall-music', kind: 'wall_music' as const, label: 'музыку' },
    }[type as 'image' | 'video' | 'music'];
    notify(`Загружаем ${cfg.label}...`);
    const res = await uploadMedia(file, cfg.folder, vu, cfg.kind);
    if (!res) { notify('Не удалось загрузить файл', 'err'); return; }
    const pos = at ?? randomSpot();
    const size = DEFAULT_SIZE[type];
    const content = type === 'music'
      ? { title: file.name.replace(/\.[^.]+$/, ''), artist: '', dataUrl: res.url }
      : res.url;
    setBlocks((bs) => [...bs, { id: newBlockId(), type, ...pos, ...size, rot: 0, content }]);
  }, [vu, notify]);

  async function addBlock(type: BlockType) {
    if (type === 'text') {
      setBlocks((bs) => [...bs, {
        id: newBlockId(), type: 'text', ...randomSpot(), ...DEFAULT_SIZE.text, rot: 0,
        content: 'Твой текст...', style: { fontSize: 14 },
      }]);
      return;
    }
    const accept = type === 'image' ? 'image/*' : type === 'video' ? 'video/*' : 'audio/*';
    const file = await pickFile(accept, type === 'music' ? 'audio' : type, (m) => notify(m, 'err'));
    if (file) void addBlockFromFile(type, file);
  }

  async function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const kind = fileKind(file);
    const type: BlockType | null = kind === 'image' ? 'image' : kind === 'video' ? 'video' : kind === 'audio' ? 'music' : null;
    if (!kind || !type) { notify('Этот тип файла не поддерживается', 'err'); return; }
    const limit = MAX_FILE_MB[kind];
    if (file.size > limit * 1024 * 1024) { notify(`Файл слишком большой. Максимум ${limit} МБ.`, 'err'); return; }
    // Позиция с учётом прокрутки холста.
    const rect = e.currentTarget.getBoundingClientRect();
    const at = {
      x: Math.max(0, e.clientX - rect.left + e.currentTarget.scrollLeft - 100),
      y: Math.max(0, e.clientY - rect.top + e.currentTarget.scrollTop - 60),
    };
    void addBlockFromFile(type, file, at);
  }

  async function save(force = false) {
    if (loadError || saving) return;
    setSaving(true);
    const r = await DB.setWall(vu, blocks, force ? null : versionRef.current);
    setSaving(false);
    if (!r.ok) {
      if (r.error === 'conflict') { setAskLeave(false); setConflict(true); return; }
      notify(r.error === 'network'
        ? 'Нет связи с сервером — стена не сохранена, твои правки остались на экране'
        : 'Не удалось сохранить стену. Попробуй ещё раз.', 'err');
      return;
    }
    versionRef.current = r.version;
    savedRef.current = JSON.stringify(blocks);
    setConflict(false); setAskLeave(false);
    setEditing(false);
    const backToAdmin = me.username === ADMIN_USERNAME && vu !== me.username;
    setAdminEditingAs(null);
    if (backToAdmin) setTab('admin');
    notify('Стена сохранена');
  }

  // Кнопка «Режим правки»: выход с несохранёнными изменениями требует решения.
  function toggleEdit() {
    if (!editing) { setEditing(true); return; }
    if (dirty) setAskLeave(true); else setEditing(false);
  }
  function discard() {
    setBlocks(JSON.parse(savedRef.current) as WallBlock[]);
    setAskLeave(false);
    setEditing(false);
  }
  async function reloadFromServer() {
    setConflict(false);
    await load();
  }

  const bg = useMemo(() => {
    if (!viewUser) return 'var(--bg)';
    const c = safeColor(viewUser.color);
    return `radial-gradient(ellipse at 14% 18%, color-mix(in oklab, ${c} 11%, transparent) 0%, transparent 50%), radial-gradient(ellipse at 86% 82%, color-mix(in oklab, ${c} 6%, transparent) 0%, transparent 48%), var(--bg)`;
  }, [viewUser]);

  // Размер полотна растёт вместе с блоками, чтобы до любого блока можно было доскроллить.
  const surface = useMemo(() => ({
    w: blocks.reduce((m, b) => Math.max(m, b.x + b.w), 0) + 80,
    h: blocks.reduce((m, b) => Math.max(m, b.y + b.h), 0) + 80,
  }), [blocks]);

  if (loading) return <div id="loading-screen"><div className="loader" /><p>Загружаем стену...</p></div>;
  if (loadError) {
    return (
      <div id="loading-screen" role="alert">
        <p>Не удалось загрузить стену. Проверь соединение — ничего не потеряно.</p>
        <button className="auth-btn" style={{ maxWidth: 220 }} onClick={() => void load()}>Повторить</button>
      </div>
    );
  }
  if (!viewUser) return <div style={{ padding: 40, color: 'var(--text3)' }}>Пользователь не найден</div>;

  return (
    <div id="wall-view" style={{ animation: 'slideIn .35s ease' }}>
      <ProfileBar
        viewUser={viewUser} isBanned={banned} isOwner={isOwner}
        isFriend={friends.includes(vu)} nearbyFriends={nearby}
        editing={editing} onToggleEdit={toggleEdit}
        onFriendChange={reloadFriends} onUserChange={(u) => { setViewUser(u); if (u.username === me.username) updateUser(u); }}
      />

      <div className="wall-stage">
        <div
          id="wall-canvas" className={dragOver ? 'drag-over' : ''}
          onDragOver={canEdit ? (e) => { e.preventDefault(); setDragOver(true); } : undefined}
          onDragLeave={canEdit ? () => setDragOver(false) : undefined}
          onDrop={canEdit ? onDrop : undefined}
        >
          <div className="wall-surface" style={{ minWidth: surface.w, minHeight: surface.h }}>
            <div className="wall-bg" style={{ background: bg }} />
            <div className="wall-dots" />
            <div id="blocks-layer">
              {blocks.map((b, i) => (
                <Block
                  key={b.id} block={b} editing={canEdit} ownerUsername={vu} zIndex={i + 1}
                  reactions={reactions[b.id] || []} currentUsername={me.username}
                  onToggleReaction={toggleReaction}
                  onChange={change} onDelete={remove} onDuplicate={duplicate} onReorder={reorder}
                />
              ))}
            </div>
          </div>
        </div>
        {canEdit && <EditToolbar saving={saving} onAdd={addBlock} onSave={() => void save()} />}
      </div>

      <Modal open={askLeave} onClose={() => setAskLeave(false)} title="Есть несохранённые изменения">
        <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text2)', marginBottom: 16 }}>
          Сохранить стену перед выходом из режима правки?
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-accent" disabled={saving} onClick={() => void save()}>Сохранить</button>
          <button className="btn" onClick={discard}>Не сохранять</button>
          <button className="btn" onClick={() => setAskLeave(false)}>Продолжить правку</button>
        </div>
      </Modal>

      <Modal open={conflict} onClose={() => setConflict(false)} title="Стена изменилась">
        <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text2)', marginBottom: 16 }}>
          Пока ты правил, эту стену сохранили в другом окне (или это сделал администратор).
          Можно перезаписать её своей версией или загрузить актуальную — тогда твои правки пропадут.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-accent" disabled={saving} onClick={() => void save(true)}>Перезаписать моей версией</button>
          <button className="btn" onClick={() => void reloadFromServer()}>Загрузить актуальную</button>
          <button className="btn" onClick={() => setConflict(false)}>Отмена</button>
        </div>
      </Modal>
    </div>
  );
}

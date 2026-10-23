import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ADMIN_USERNAME, MAX_FILE_MB, type BlockType, type User, type WallBlock, type BlockReaction } from '../../types';
import { DB, uploadMedia } from '../../supabase';
import { pickFile } from '../../lib/pickFile';
import { stopAllMedia } from '../../hooks/useMediaPlayback';
import { cloneBlocks, DEFAULT_SIZE, newBlockId, randomSpot } from './wallGeometry';
import ProfileBar from './ProfileBar';
import EditToolbar from './EditToolbar';
import Block from './Block';

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
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const isOwner = vu === me.username || adminEditingAs === vu;
  const canEdit = editing && isOwner;

  const load = useCallback(async () => {
    setLoading(true);
    const [u, wall, myFriends, vFriends, ban] = await Promise.all([
      DB.getUser(vu), DB.getWall(vu), DB.getFriends(me.username), DB.getFriends(vu), DB.getBan(vu),
    ]);
    setViewUser(u);
    setBlocks(cloneBlocks(wall));
    setFriends(myFriends);
    setBanned(!!ban);
    const blockIds = wall.map((b) => b.id);
    setReactions(blockIds.length ? await DB.getBlockReactions(blockIds) : {});
    const ids = [...new Set([...myFriends, ...vFriends])].filter((f) => f !== vu).slice(0, 6);
    const users = await Promise.all(ids.map((id) => DB.getUser(id)));
    setNearby(users.filter((x): x is User => !!x));
    setLoading(false);
  }, [vu, me.username]);

  useEffect(() => { load(); }, [load]);

  // Остановить звук при уходе со стены / смене стены
  useEffect(() => () => stopAllMedia(), [vu]);

  // Предупреждение о несохранённых правках при закрытии вкладки
  useEffect(() => {
    if (!canEdit) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [canEdit]);

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

  const toggleReaction = useCallback((blockId: string, emoji: string) => {
    const list = reactions[blockId] || [];
    const mine = list.find((r) => r.username === me.username);
    const removing = mine?.emoji === emoji;
    // Оптимистичное обновление UI, затем сохранение.
    setReactions((map) => {
      const cur = map[blockId] || [];
      const next = removing
        ? cur.filter((r) => r.username !== me.username)
        : cur.filter((r) => r.username !== me.username).concat({ blockId, username: me.username, emoji });
      return { ...map, [blockId]: next };
    });
    if (removing) DB.removeReaction(blockId, me.username);
    else DB.setReaction(blockId, me.username, emoji);
  }, [reactions, me.username]);

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
    if (file) addBlockFromFile(type, file);
  }

  async function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const at = { x: e.clientX - rect.left - 100, y: e.clientY - rect.top - 60 };
    const type: BlockType | null = file.type.startsWith('image/') ? 'image'
      : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'music' : null;
    if (!type) { notify('Этот тип файла не поддерживается', 'err'); return; }
    const limit = MAX_FILE_MB[type === 'music' ? 'audio' : type];
    if (file.size > limit * 1024 * 1024) { notify(`Файл слишком большой. Максимум ${limit} МБ.`, 'err'); return; }
    addBlockFromFile(type, file, at);
  }

  async function save() {
    setSaving(true);
    const ok = await DB.setWall(vu, blocks);
    setSaving(false);
    if (!ok) { notify('Не удалось сохранить стену. Попробуй ещё раз.', 'err'); return; }
    setEditing(false);
    const backToAdmin = me.username === ADMIN_USERNAME && vu !== me.username;
    setAdminEditingAs(null);
    if (backToAdmin) setTab('admin');
    notify('Стена сохранена');
  }

  const bg = useMemo(() => viewUser
    ? `radial-gradient(ellipse at 14% 18%, color-mix(in oklab, ${viewUser.color} 11%, transparent) 0%, transparent 50%), radial-gradient(ellipse at 86% 82%, color-mix(in oklab, ${viewUser.color} 6%, transparent) 0%, transparent 48%), var(--bg)`
    : 'var(--bg)', [viewUser]);

  if (loading) return <div id="loading-screen"><div className="loader" /><p>Загружаем стену...</p></div>;
  if (!viewUser) return <div style={{ padding: 40, color: 'var(--text3)' }}>Пользователь не найден</div>;

  return (
    <div id="wall-view" style={{ animation: 'slideIn .35s ease' }}>
      <ProfileBar
        viewUser={viewUser} isBanned={banned} isOwner={isOwner}
        isFriend={friends.includes(vu)} nearbyFriends={nearby}
        onFriendChange={load} onUserChange={(u) => { setViewUser(u); if (u.username === me.username) updateUser(u); }}
      />

      <div
        id="wall-canvas" className={dragOver ? 'drag-over' : ''}
        onDragOver={canEdit ? (e) => { e.preventDefault(); setDragOver(true); } : undefined}
        onDragLeave={canEdit ? () => setDragOver(false) : undefined}
        onDrop={canEdit ? onDrop : undefined}
      >
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
        {canEdit && <EditToolbar saving={saving} onAdd={addBlock} onSave={save} />}
      </div>
    </div>
  );
}

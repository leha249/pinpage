import { useRef } from 'react';
import type { WallBlock, MusicContent, BlockReaction } from '../../types';
import { useBlockInteraction } from './useBlockInteraction';
import TextBlock from './blocks/TextBlock';
import ImageBlock from './blocks/ImageBlock';
import VideoBlock from './blocks/VideoBlock';
import MusicBlock from './blocks/MusicBlock';
import ReactionsBar from './ReactionsBar';
import TextStyleBar from './TextStyleBar';

interface Props {
  block: WallBlock;
  editing: boolean;
  ownerUsername: string;
  reactions: BlockReaction[];
  currentUsername: string;
  onToggleReaction: (blockId: string, emoji: string) => void | Promise<void>;
  onChange: (id: string, patch: Partial<WallBlock>) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onReorder: (id: string, dir: 'up' | 'down') => void;
  zIndex: number;
}

const RESIZE_HANDLES: { cls: string; dx: number; dy: number }[] = [
  { cls: 'rh-se', dx: 1, dy: 1 },
  { cls: 'rh-sw', dx: -1, dy: 1 },
  { cls: 'rh-ne', dx: 1, dy: -1 },
  { cls: 'rh-nw', dx: -1, dy: -1 },
  { cls: 'rh-e', dx: 1, dy: 0 },
  { cls: 'rh-w', dx: -1, dy: 0 },
  { cls: 'rh-s', dx: 0, dy: 1 },
  { cls: 'rh-n', dx: 0, dy: -1 },
];

export default function Block({ block, editing, ownerUsername, reactions, currentUsername, onToggleReaction, onChange, onDelete, onDuplicate, onReorder, zIndex }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const patch = (p: Partial<WallBlock>) => onChange(block.id, p);
  const { startDrag, startResize, startRotate } = useBlockInteraction(block, (_id, p) => patch(p));

  const radius = block.radius ?? 10;

  return (
    <div
      ref={wrapRef}
      className={'block' + (editing ? ' block-editing' : '')}
      style={{ left: block.x, top: block.y, width: block.w, height: block.h, rotate: `${block.rot || 0}deg`, zIndex, touchAction: editing ? 'none' : undefined }}
      onPointerDown={editing ? startDrag : undefined}
    >
      <div
        className={
          'block-inner ' +
          (block.type === 'text' ? 'block-text-bg' : block.type === 'music' ? 'block-music-bg' : block.type === 'video' ? 'block-video-bg' : '')
        }
        style={{ boxShadow: editing ? undefined : '0 4px 20px rgba(0,0,0,.3)', cursor: editing ? 'grab' : 'default' }}
      >
        {block.type === 'text' && (
          <TextBlock block={block} editing={editing} onEdit={(text) => patch({ content: text })} />
        )}
        {block.type === 'image' && (
          <ImageBlock url={block.content as string} radius={radius} editing={editing} onRadiusChange={(r) => patch({ radius: r })} />
        )}
        {block.type === 'video' && (
          <VideoBlock url={block.content as string} radius={radius} editing={editing} onRadiusChange={(r) => patch({ radius: r })} />
        )}
        {block.type === 'music' && (
          <MusicBlock
            content={block.content as MusicContent} editing={editing} ownerUsername={ownerUsername}
            onChange={(p) => patch({ content: { ...(block.content as MusicContent), ...p } })}
          />
        )}
      </div>

      {editing && (
        <>
          <div className="block-ctrl">
            <button className="bc-btn" title="Ниже" aria-label="Ниже" onClick={() => onReorder(block.id, 'down')}>↓</button>
            <button className="bc-btn" title="Выше" aria-label="Выше" onClick={() => onReorder(block.id, 'up')}>↑</button>
            <button className="bc-btn" title="Сбросить поворот" aria-label="Сбросить поворот" onClick={() => patch({ rot: 0 })}>⊕</button>
            <button className="bc-btn" title="Дублировать" aria-label="Дублировать" onClick={() => onDuplicate(block.id)}>Копия</button>
            <button className="bc-btn bc-del" title="Удалить" aria-label="Удалить" onClick={() => onDelete(block.id)}>✕</button>
          </div>

          {RESIZE_HANDLES.map((h) => (
            <div
              key={h.cls} className={'resize-handle ' + h.cls}
              onPointerDown={(e) => startResize(e, h.dx, h.dy)}
            />
          ))}

          {block.type === 'text' && (
            <TextStyleBar style={block.style} onChange={(p) => patch({ style: { ...block.style, ...p } })} />
          )}

          <div
            className="rot-handle" title="Тяни для поворота" aria-label="Повернуть"
            onPointerDown={(e) => wrapRef.current && startRotate(e, wrapRef.current)}
          />
        </>
      )}

      {!editing && (
        <ReactionsBar
          blockId={block.id}
          reactions={reactions}
          currentUsername={currentUsername}
          onToggle={onToggleReaction}
        />
      )}
    </div>
  );
}

import { useState } from 'react';
import type { BlockReaction } from '../../types';

const EMOJIS = ['👍', '❤️', '🔥', '😄', '😮', '😢'];

interface Props {
  blockId: string;
  reactions: BlockReaction[];
  currentUsername: string;
  onToggle: (blockId: string, emoji: string) => void | Promise<void>;
}

/** Полоска реакций внизу блока: существующие эмодзи со счётчиками + «+» для выбора. */
export default function ReactionsBar({ blockId, reactions, currentUsername, onToggle }: Props) {
  const [open, setOpen] = useState(false);

  const grouped = new Map<string, { count: number; mine: boolean }>();
  for (const r of reactions) {
    const g = grouped.get(r.emoji) || { count: 0, mine: false };
    g.count += 1;
    if (r.username === currentUsername) g.mine = true;
    grouped.set(r.emoji, g);
  }

  const pick = (emoji: string) => {
    onToggle(blockId, emoji);
    setOpen(false);
  };

  return (
    <div className="reactions-bar" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      {[...grouped.entries()].map(([emoji, g]) => (
        <button
          key={emoji}
          className={'react-pill' + (g.mine ? ' mine' : '')}
          title={emoji} aria-label={`Реакция ${emoji}`} aria-pressed={g.mine}
          onClick={() => pick(emoji)}
        >
          <span>{emoji}</span>
          {g.count > 1 && <span className="react-count">{g.count}</span>}
        </button>
      ))}

      <button className="react-add" title="Добавить реакцию" aria-label="Добавить реакцию" onClick={() => setOpen((o) => !o)}>+</button>

      {open && (
        <div className="react-picker">
          {EMOJIS.map((e) => (
            <button key={e} className="react-option" title={e} aria-label={`Реакция ${e}`} onClick={() => pick(e)}>{e}</button>
          ))}
        </div>
      )}
    </div>
  );
}

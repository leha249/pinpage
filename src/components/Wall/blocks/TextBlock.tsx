import type { WallBlock } from '../../../types';
import { safeColor } from '../../../lib/safe';

interface Props { block: WallBlock; editing: boolean; onEdit: (text: string) => void }

export default function TextBlock({ block, editing, onEdit }: Props) {
  const s = block.style || {};
  const family = s.family === 'serif' ? 'var(--font-serif)' : s.family === 'mono' ? 'var(--font-mono)' : 'var(--font)';
  const textStyle = {
    color: s.color ? safeColor(s.color, 'var(--text)') : 'var(--text)',
    fontSize: Math.min(96, Math.max(8, s.fontSize || 14)),
    fontFamily: family,
    fontStyle: s.italic ? 'italic' as const : 'normal' as const,
  };

  if (editing) {
    return (
      <textarea
        className="block-text-edit" style={textStyle} defaultValue={block.content as string}
        aria-label="Текст блока" maxLength={5000}
        onBlur={(e) => onEdit(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
      />
    );
  }
  return <div className="block-text-view" style={textStyle}>{block.content as string}</div>;
}

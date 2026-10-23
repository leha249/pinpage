import type { WallBlock } from '../../../types';

interface Props { block: WallBlock; editing: boolean; onEdit: (text: string) => void }

export default function TextBlock({ block, editing, onEdit }: Props) {
  const s = block.style || {};
  const family = s.family === 'serif' ? 'var(--font-serif)' : s.family === 'mono' ? 'var(--font-mono)' : 'var(--font)';
  const textStyle = { color: s.color || 'var(--text)', fontSize: s.fontSize || 14, fontFamily: family, fontStyle: s.italic ? 'italic' as const : 'normal' as const };

  if (editing) {
    return (
      <textarea
        className="block-text-edit" style={textStyle} defaultValue={block.content as string}
        onBlur={(e) => onEdit(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
      />
    );
  }
  return <div className="block-text-view" style={textStyle}>{block.content as string}</div>;
}

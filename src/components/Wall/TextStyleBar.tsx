import type { TextStyle } from '../../types';
import { safeColor } from '../../lib/safe';

interface Props { style: TextStyle | undefined; onChange: (patch: TextStyle) => void }

const SIZES = [12, 14, 16, 20, 24, 32, 48];

/** Панель оформления текстового блока (размер, шрифт, курсив, цвет) — показывается только в режиме правки. */
export default function TextStyleBar({ style, onChange }: Props) {
  const s = style || {};
  const size = SIZES.includes(s.fontSize || 14) ? (s.fontSize || 14) : 14;
  return (
    <div className="text-style-bar" onPointerDown={(e) => e.stopPropagation()}>
      <select aria-label="Размер текста" value={size} onChange={(e) => onChange({ fontSize: Number(e.target.value) })}>
        {SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <select aria-label="Шрифт" value={s.family || 'sans'} onChange={(e) => onChange({ family: e.target.value as TextStyle['family'] })}>
        <option value="sans">Обычный</option>
        <option value="serif">С засечками</option>
        <option value="mono">Моно</option>
      </select>
      <button className={'bc-btn' + (s.italic ? ' active' : '')} aria-pressed={!!s.italic} aria-label="Курсив" title="Курсив"
        onClick={() => onChange({ italic: !s.italic })}><i>К</i></button>
      <input type="color" aria-label="Цвет текста" value={safeColor(s.color, '#e8e8f0')}
        onChange={(e) => onChange({ color: e.target.value })} />
    </div>
  );
}

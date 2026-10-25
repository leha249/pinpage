import { useState } from 'react';
import { openLightbox } from '../../Lightbox';

interface Props { url: string; radius: number; editing: boolean; onRadiusChange: (r: number) => void }

export default function ImageBlock({ url, radius, editing, onRadiusChange }: Props) {
  const [broken, setBroken] = useState(false);

  if (broken) {
    return (
      <div style={{ width: '100%', height: '100%', background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 12, borderRadius: radius }}>
        Не загрузилось
      </div>
    );
  }

  return (
    <>
      <img
        src={url} alt="" onError={() => setBroken(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: radius, cursor: editing ? 'default' : 'zoom-in', display: 'block' }}
        onClick={() => !editing && openLightbox(url)}
      />
      {editing && (
        <div className="radius-ctrl" onPointerDown={(e) => e.stopPropagation()}>
          <span className="radius-lbl">Скругление</span>
          <input
            type="range" min={0} max={50} value={radius} className="radius-slider"
            onChange={(e) => onRadiusChange(Number(e.target.value))}
          />
        </div>
      )}
    </>
  );
}

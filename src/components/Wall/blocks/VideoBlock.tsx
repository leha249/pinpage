import { useRef, useState } from 'react';
import { playExclusive } from '../../../hooks/useMediaPlayback';

interface Props { url: string; radius: number; editing: boolean; onRadiusChange: (r: number) => void }

export default function VideoBlock({ url, radius, editing, onRadiusChange }: Props) {
  const [broken, setBroken] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);

  if (broken) {
    return (
      <div style={{ width: '100%', height: '100%', background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 12 }}>
        Не загрузилось
      </div>
    );
  }

  return (
    <>
      <video
        ref={ref} src={url} controls playsInline preload="metadata" onError={() => setBroken(true)}
        onPlay={() => ref.current && playExclusive(ref.current)}
        onPointerDown={(e) => editing && e.stopPropagation()}
        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: radius }}
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

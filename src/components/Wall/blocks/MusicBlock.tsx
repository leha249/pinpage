import { useEffect, useRef, useState } from 'react';
import type { MusicContent } from '../../../types';
import { uploadMedia } from '../../../supabase';
import { pickFile } from '../../../lib/pickFile';
import { playExclusive } from '../../../hooks/useMediaPlayback';
import { useApp } from '../../../context/AppContext';

interface Props {
  content: MusicContent;
  editing: boolean;
  ownerUsername: string;
  onChange: (patch: Partial<MusicContent>) => void;
}

export default function MusicBlock({ content, editing, ownerUsername, onChange }: Props) {
  const { notify } = useApp();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!content.dataUrl) return;
    const audio = new Audio(content.dataUrl);
    audio.volume = 0.8;
    audioRef.current = audio;
    const onPause = () => setPlaying(false);
    const onEnded = () => { setPlaying(false); setProgress(0); };
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    return () => { audio.pause(); audio.removeEventListener('pause', onPause); audio.removeEventListener('ended', onEnded); };
  }, [content.dataUrl]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) { setPlaying((p) => !p); setProgress((p) => (p ? 0 : 70)); return; }
    if (playing) { audio.pause(); }
    else { playExclusive(audio); audio.play().catch(() => {}); setProgress(100); }
    setPlaying(!playing);
  };

  const pickCover = async () => {
    const file = await pickFile('image/*', 'image', (msg) => notify(msg, 'err'));
    if (!file) return;
    setUploading(true);
    const res = await uploadMedia(file, 'covers', ownerUsername, 'wall_cover');
    setUploading(false);
    if (res) onChange({ coverUrl: res.url });
  };

  return (
    <div className="music-shell">
      <div className="music-body">
        <div className="music-pad">
          <div className="music-row">
            <div className="music-cover" onClick={editing ? pickCover : undefined} style={{ cursor: editing ? 'pointer' : 'default' }}>
              {content.coverUrl
                ? <img src={content.coverUrl} alt="" />
                : <div className="music-cover-placeholder">{uploading ? '…' : '♪'}</div>}
              {editing && <div className="music-cover-edit-overlay">+</div>}
            </div>

            <button className={'music-play' + (playing ? ' on' : '')} onClick={togglePlay} onPointerDown={(e) => e.stopPropagation()}>
              {playing ? '⏸' : '▶'}
            </button>

            <div className="music-info" onPointerDown={(e) => editing && e.stopPropagation()}>
              {editing ? (
                <>
                  <input
                    className="music-edit-inp" defaultValue={content.title} placeholder="Название"
                    onBlur={(e) => onChange({ title: e.target.value })}
                  />
                  <input
                    className="music-edit-inp music-edit-artist" defaultValue={content.artist} placeholder="Исполнитель"
                    onBlur={(e) => onChange({ artist: e.target.value })}
                  />
                </>
              ) : (
                <>
                  <div className="music-title">{content.title || 'Unknown'}</div>
                  <div className="music-artist">{content.artist}</div>
                </>
              )}
            </div>
          </div>

          <div className="music-bar-wrap">
            <div className="music-fill" style={{ width: progress + '%', transition: playing ? `width ${audioRef.current?.duration || 60}s linear` : 'width .3s' }} />
          </div>
        </div>
      </div>

      <div className="music-vol-strip" onPointerDown={(e) => e.stopPropagation()}>
        <input
          type="range" min={0} max={100} defaultValue={80} className="music-vol-slider"
          onChange={(e) => { if (audioRef.current) audioRef.current.volume = Number(e.target.value) / 100; }}
        />
      </div>
    </div>
  );
}

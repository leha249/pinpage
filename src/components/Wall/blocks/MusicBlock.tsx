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
  const volumeRef = useRef(0.8);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!content.dataUrl) return;
    setFailed(false); setPlaying(false); setProgress(0);
    const audio = new Audio();
    audio.preload = 'none'; // не качаем трек, пока его не включили (на стене их может быть много)
    audio.src = content.dataUrl;
    audio.volume = volumeRef.current;
    audioRef.current = audio;

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => { setPlaying(false); setProgress(0); };
    const onTime = () => setProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0);
    const onError = () => { setFailed(true); setPlaying(false); };
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('error', onError);
    return () => {
      audio.pause();
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('error', onError);
    };
  }, [content.dataUrl]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || failed) return;
    if (playing) { audio.pause(); setPlaying(false); return; }
    playExclusive(audio);
    setPlaying(true);
    // Если браузер отказал (трек недоступен, автовоспроизведение запрещено) — возвращаем кнопку в «▶».
    Promise.resolve(audio.play()).catch(() => { setPlaying(false); setFailed(true); });
  };

  // Перемотка кликом по полоске
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    audio.currentTime = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) * audio.duration;
  };

  const pickCover = async () => {
    const file = await pickFile('image/*', 'image', (msg) => notify(msg, 'err'));
    if (!file) return;
    setUploading(true);
    const res = await uploadMedia(file, 'covers', ownerUsername, 'wall_cover');
    setUploading(false);
    if (res) onChange({ coverUrl: res.url });
    else notify('Не удалось загрузить обложку', 'err');
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

            <button
              className={'music-play' + (playing ? ' on' : '')} disabled={failed}
              aria-label={failed ? 'Трек недоступен' : playing ? 'Пауза' : 'Играть'} title={failed ? 'Трек недоступен' : undefined}
              onClick={togglePlay} onPointerDown={(e) => e.stopPropagation()}
            >
              {failed ? '⚠' : playing ? '⏸' : '▶'}
            </button>

            <div className="music-info" onPointerDown={(e) => editing && e.stopPropagation()}>
              {editing ? (
                <>
                  <input
                    className="music-edit-inp" defaultValue={content.title} placeholder="Название" aria-label="Название трека" maxLength={120}
                    onBlur={(e) => onChange({ title: e.target.value })}
                  />
                  <input
                    className="music-edit-inp music-edit-artist" defaultValue={content.artist} placeholder="Исполнитель" aria-label="Исполнитель" maxLength={120}
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

          <div className="music-bar-wrap" onClick={seek} onPointerDown={(e) => e.stopPropagation()} style={{ cursor: 'pointer' }}>
            <div className="music-fill" style={{ width: progress + '%' }} />
          </div>
        </div>
      </div>

      <div className="music-vol-strip" onPointerDown={(e) => e.stopPropagation()}>
        <input
          type="range" min={0} max={100} defaultValue={80} className="music-vol-slider" aria-label="Громкость"
          onChange={(e) => { volumeRef.current = Number(e.target.value) / 100; if (audioRef.current) audioRef.current.volume = volumeRef.current; }}
        />
      </div>
    </div>
  );
}

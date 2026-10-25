export type FileKind = 'image' | 'audio' | 'video';

const MIME: Record<string, FileKind> = {
  'image/jpeg': 'image', 'image/png': 'image', 'image/gif': 'image', 'image/webp': 'image', 'image/avif': 'image',
  'video/mp4': 'video', 'video/webm': 'video', 'video/quicktime': 'video',
  'audio/mpeg': 'audio', 'audio/mp4': 'audio', 'audio/aac': 'audio', 'audio/ogg': 'audio', 'audio/wav': 'audio',
  'audio/x-wav': 'audio', 'audio/webm': 'audio', 'audio/flac': 'audio', 'audio/x-m4a': 'audio',
};

const EXT: Record<string, { kind: FileKind; mime: string }> = {
  jpg: { kind: 'image', mime: 'image/jpeg' }, jpeg: { kind: 'image', mime: 'image/jpeg' },
  png: { kind: 'image', mime: 'image/png' }, gif: { kind: 'image', mime: 'image/gif' },
  webp: { kind: 'image', mime: 'image/webp' }, avif: { kind: 'image', mime: 'image/avif' },
  mp4: { kind: 'video', mime: 'video/mp4' }, m4v: { kind: 'video', mime: 'video/mp4' },
  webm: { kind: 'video', mime: 'video/webm' }, mov: { kind: 'video', mime: 'video/quicktime' },
  mp3: { kind: 'audio', mime: 'audio/mpeg' }, m4a: { kind: 'audio', mime: 'audio/mp4' },
  aac: { kind: 'audio', mime: 'audio/aac' }, ogg: { kind: 'audio', mime: 'audio/ogg' },
  oga: { kind: 'audio', mime: 'audio/ogg' }, wav: { kind: 'audio', mime: 'audio/wav' },
  flac: { kind: 'audio', mime: 'audio/flac' },
};

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Какой это тип файла (по MIME, а если браузер его не знает — по расширению). null — не разрешён. */
export function fileKind(file: { name: string; type: string }): FileKind | null {
  const t = (file.type || '').toLowerCase();
  if (t && t !== 'application/octet-stream') return MIME[t] ?? null; // svg, html и т.п. сюда не попадают
  return EXT[extOf(file.name)]?.kind ?? null;
}

/** MIME для загрузки: если браузер не указал тип, берём по расширению. */
export function fileMime(file: { name: string; type: string }): string | undefined {
  const t = (file.type || '').toLowerCase();
  if (t && t !== 'application/octet-stream') return t;
  return EXT[extOf(file.name)]?.mime;
}

export function safeExt(name: string): string {
  const e = extOf(name);
  return EXT[e] ? e : 'bin';
}

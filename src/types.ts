// ═══════════════════════════════════════════════════════════
// Все типы данных приложения в одном месте.
// ═══════════════════════════════════════════════════════════

export interface User {
  username: string;
  password: string; // открытый текст (без хеширования)
  displayName: string;
  bio: string;
  avatar: string; // запасной аватар — одна буква
  avatarImg?: string;
  avatarMediaId?: number;
  color: string;
  role?: 'admin';
}

export type BlockType = 'text' | 'image' | 'video' | 'music';

export interface TextStyle {
  fontSize?: number;
  color?: string;
  italic?: boolean;
  family?: 'sans' | 'serif' | 'mono';
}

export interface MusicContent {
  title: string;
  artist: string;
  dataUrl: string; // ссылка на аудиофайл (имя поля осталось с прежних версий)
  coverUrl?: string;
}

export interface WallBlock {
  id: string;
  type: BlockType;
  x: number;
  y: number;
  w: number;
  h: number;
  rot?: number;
  radius?: number; // для image/video
  content: string | MusicContent;
  style?: TextStyle; // только для text
}

/** Одна реакция (эмодзи) пользователя на блок стены. */
export interface BlockReaction {
  blockId: string;
  username: string;
  emoji: string;
}

export interface Ban {
  username: string;
  reason: string;
  at: string;
}

export interface Warning {
  text: string;
  at: number;
}

export interface ChatMessage {
  id: number;
  from: string;
  text?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  mediaId?: number;
  edited: boolean;
  read: boolean;
  at: number;
}

export interface ChangelogEntry {
  id: number;
  version: string;
  title: string;
  description: string;
  author: string | null;
  at: number;
}

export interface AccountStats {
  username: string;
  display_name: string;
  role: string | null;
  created_at: string;
  friends_count: number;
  files_uploaded: number;
  warnings_count: number;
  is_banned: boolean;
}

export type MediaKind = 'avatar' | 'wall_image' | 'wall_video' | 'wall_music' | 'wall_cover' | 'chat';
export type Theme = 'dark' | 'light';
export type Tab = 'wall' | 'friends' | 'changelog' | 'settings' | 'admin';

export const ADMIN_USERNAME = 'leha249';

export const MAX_FILE_MB: Record<'image' | 'audio' | 'video', number> = {
  image: 10,
  audio: 25,
  video: 50,
};

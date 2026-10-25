import { createClient } from '@supabase/supabase-js';
import type {
  User, WallBlock, Ban, Warning, ChatMessage, ChangelogEntry, AccountStats, MediaKind, BlockReaction, ProfilePatch,
} from './types';
import { fileKind, fileMime, safeExt, type FileKind } from './lib/fileKinds';

// ═══════════════════════════════════════════════════════════
// SUPABASE — клиент и слой данных.
//
// Безопасность: публичный (anon) ключ даёт только ЧТЕНИЕ публичного (профили, стены,
// друзья). Всё остальное идёт через SQL-функции pp_*: после входа сервер выдаёт
// токен сессии (хранится в localStorage), и каждая функция проверяет его сама.
// Все чтения БРОСАЮТ ошибку при сбое — «нет данных» и «не удалось загрузить»
// нельзя путать (иначе сбой сети выглядит как пустая стена и ведёт к потере данных).
// ═══════════════════════════════════════════════════════════
// Для разработки/тестов можно подставить свою базу через .env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || 'https://kryaklbvqkupjcbkjntp.supabase.co';
const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtyeWFrbGJ2cWt1cGpjYmtqbnRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyNDk1MTEsImV4cCI6MjEwNDgyNTUxMX0.-DToXzto4R2Jb1kq11JN_ZMa6SIZGYymX9AzkxAoD3c';
const MEDIA_BUCKET = 'media';
const TOKEN_KEY = 'pp_token';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { params: { eventsPerSecond: 2 } } });

// ── Токен сессии и ошибки авторизации ────────────────────────────────────────
export class AuthError extends Error {
  constructor(public code: 'unauthorized' | 'banned' | 'forbidden') { super(code); }
}
type AuthLostHandler = (code: 'unauthorized' | 'banned') => void;
let authLost: AuthLostHandler | null = null;
/** Подписка на «сервер больше не признаёт сессию» (истекла, заблокирован). */
export function onAuthLost(h: AuthLostHandler): () => void {
  authLost = h;
  return () => { if (authLost === h) authLost = null; };
}

function readToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function writeToken(t: string | null) {
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* приватный режим */ }
}

/** Вызов SQL-функции. auth=true добавляет токен сессии. */
async function call<T>(fn: string, args: Record<string, unknown> = {}, auth = true): Promise<T> {
  let params = args;
  if (auth) {
    const token = readToken();
    if (!token) throw new AuthError('unauthorized');
    params = { p_token: token, ...args };
  }
  const { data, error } = await supabase.rpc(fn, params);
  if (error) {
    const msg = error.message || '';
    if (msg === 'unauthorized' || msg === 'banned') {
      writeToken(null);
      authLost?.(msg);
      throw new AuthError(msg);
    }
    if (msg === 'forbidden') throw new AuthError('forbidden');
    throw new Error(msg || 'Ошибка запроса');
  }
  return data as T;
}

/** Для «да/нет»-операций: любая ошибка = false (сообщение пользователю решает вызывающий). */
async function ok(fn: string, args: Record<string, unknown> = {}): Promise<boolean> {
  try { return (await call<boolean>(fn, args)) === true; } catch { return false; }
}

function must<T>(res: { data: T | null; error: { message: string } | null }): T | null {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** Постраничная загрузка: Supabase отдаёт максимум 1000 строк за запрос. */
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const rows = must(await build(from, from + 999)) || [];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

// ── Строки БД ↔ типы приложения ──────────────────────────────────────────────
interface UserRow {
  username: string; display_name: string; bio: string;
  avatar: string; avatar_img: string | null; avatar_media_id: number | null;
  color: string; role: string | null;
}
function userFromRow(row: UserRow): User {
  return {
    username: row.username, displayName: row.display_name,
    bio: row.bio || '', avatar: row.avatar, avatarImg: row.avatar_img || undefined,
    avatarMediaId: row.avatar_media_id || undefined, color: row.color,
    role: (row.role as 'admin') || undefined,
  };
}
interface MsgRow {
  id: number; from_user: string; text: string | null; media_url: string | null;
  media_type: 'image' | 'video' | null; media_id: number | null; edited: boolean; read: boolean; at: string;
}

// ── Результаты входа ─────────────────────────────────────────────────────────
export type AuthFailure = 'bad_credentials' | 'too_many' | 'banned' | 'taken' | 'invalid' | 'reserved' | 'network';
export type LoginResult = { ok: true; user: User } | { ok: false; error: AuthFailure; reason?: string };
export type ResumeResult =
  | { ok: true; user: User }
  | { ok: false; error: 'none' | 'unauthorized' | 'banned'; reason?: string };
export interface StatusResult { banned: boolean; reason?: string; warnings: Warning[] }
export type SetWallResult = { ok: true; version: string } | { ok: false; error: 'conflict' | 'invalid' | 'not_found' | 'network' | 'unauthorized' };

interface RawSession { ok: boolean; token?: string; user?: UserRow; error?: string; reason?: string }
function finishSession(r: RawSession): LoginResult {
  if (r.ok && r.token && r.user) { writeToken(r.token); return { ok: true, user: userFromRow(r.user) }; }
  return { ok: false, error: (r.error as AuthFailure) || 'invalid', reason: r.reason };
}

// ── Загрузка файлов ──────────────────────────────────────────────────────────
const ALLOWED_FOR: Record<MediaKind, FileKind[]> = {
  avatar: ['image'], wall_image: ['image'], wall_video: ['video'], wall_music: ['audio'], wall_cover: ['image'],
  chat: ['image', 'video'],
};

export async function uploadMedia(
  file: File, folder: string, ownerUsername: string, kind: MediaKind
): Promise<{ url: string; id: number | null } | null> {
  const detected = fileKind(file);
  if (!detected || !ALLOWED_FOR[kind].includes(detected)) return null;

  const owner = ownerUsername.replace(/[^a-z0-9_]/g, '') || 'user';
  const path = `${folder}/${owner}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${safeExt(file.name)}`;

  const { error: upErr } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
    contentType: fileMime(file), cacheControl: '31536000', upsert: false,
  });
  if (upErr) return null;
  const url = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;

  let id: number | null = null;
  try { id = (await call<number | null>('pp_add_media', { p_url: url, p_kind: kind, p_mime: fileMime(file) ?? null })) ?? null; }
  catch { /* запись в журнал файлов — best-effort */ }
  return { url, id };
}

export const DB = {
  // ── Сессия ──
  async login(username: string, password: string): Promise<LoginResult> {
    try { return finishSession(await call<RawSession>('pp_login', { p_username: username, p_password: password }, false)); }
    catch { return { ok: false, error: 'network' }; }
  },
  async register(u: Pick<User, 'username' | 'displayName' | 'avatar' | 'color'>, password: string): Promise<LoginResult> {
    try {
      return finishSession(await call<RawSession>('pp_register', {
        p_username: u.username, p_password: password, p_display_name: u.displayName,
        p_avatar: u.avatar, p_color: u.color,
      }, false));
    } catch { return { ok: false, error: 'network' }; }
  },
  /** Восстановить вход по сохранённому токену. При сбое сети БРОСАЕТ (сессию не сбрасываем!). */
  async resume(): Promise<ResumeResult> {
    const token = readToken();
    if (!token) return { ok: false, error: 'none' };
    const r = await call<RawSession>('pp_resume', { p_token: token }, false);
    if (r.ok && r.user) return { ok: true, user: userFromRow(r.user) };
    writeToken(null);
    return { ok: false, error: r.error === 'banned' ? 'banned' : 'unauthorized', reason: r.reason };
  },
  async logout(): Promise<void> {
    try { await call<boolean>('pp_logout'); } catch { /* уже вышли */ }
    writeToken(null);
  },
  /** Пульс: «в сети», бан, новые предупреждения. */
  async status(): Promise<StatusResult> {
    const r = await call<{ ok: boolean; banned?: boolean; reason?: string; warnings?: { text: string; at: string }[] }>('pp_status');
    if (!r.ok) { writeToken(null); authLost?.('unauthorized'); throw new AuthError('unauthorized'); }
    return {
      banned: !!r.banned, reason: r.reason,
      warnings: (r.warnings || []).map((w) => ({ text: w.text, at: Date.parse(w.at) })),
    };
  },
  async getMyWarnings(): Promise<Warning[]> {
    const rows = await call<{ text: string; at: string }[]>('pp_my_warnings');
    return (rows || []).map((w) => ({ text: w.text, at: Date.parse(w.at) }));
  },
  async changePassword(oldPw: string, newPw: string): Promise<boolean> {
    return ok('pp_change_password', { p_old: oldPw, p_new: newPw });
  },
  async deleteAccount(password: string): Promise<boolean> {
    const done = await ok('pp_delete_account', { p_password: password });
    if (done) writeToken(null);
    return done;
  },

  // ── Профили ──
  async getUser(username: string): Promise<User | null> {
    const row = must(await supabase.from('users').select('*').eq('username', username).maybeSingle());
    return row ? userFromRow(row as UserRow) : null;
  },
  async getAllUsers(): Promise<User[]> {
    const rows = await fetchAll<UserRow>((a, b) => supabase.from('users').select('*').order('username').range(a, b));
    return rows.map(userFromRow);
  },
  /** Точечное изменение профиля (своего; чужого — только админ). Не затирает остальные поля. */
  async updateProfile(username: string, patch: ProfilePatch): Promise<boolean> {
    const p: Record<string, unknown> = {};
    if (patch.displayName !== undefined) p.display_name = patch.displayName;
    if (patch.bio !== undefined) p.bio = patch.bio;
    if (patch.avatar !== undefined) p.avatar = patch.avatar;
    if (patch.color !== undefined) p.color = patch.color;
    if (patch.avatarImg !== undefined) p.avatar_img = patch.avatarImg;
    if (patch.avatarMediaId !== undefined) p.avatar_media_id = patch.avatarMediaId;
    return ok('pp_update_profile', { p_patch: p, p_target: username });
  },

  // ── Стена ──
  async getWall(username: string): Promise<{ blocks: WallBlock[]; version: string | null }> {
    const row = must(await supabase.from('walls').select('blocks, rev').eq('username', username).maybeSingle()) as
      { blocks: WallBlock[] | null; rev: number | string | null } | null;
    // version — счётчик сохранений; null, если у пользователя ещё нет строки стены.
    return { blocks: row?.blocks || [], version: row && row.rev != null ? String(row.rev) : null };
  },
  /** base — версия, с которой стена была загружена; при расхождении сервер вернёт conflict. */
  async setWall(username: string, blocks: WallBlock[], base: string | null): Promise<SetWallResult> {
    try {
      const r = await call<{ ok: boolean; version?: number; error?: string }>('pp_set_wall', {
        p_username: username, p_blocks: blocks, p_base: base === null ? null : Number(base),
      });
      if (r.ok && r.version != null) return { ok: true, version: String(r.version) };
      return { ok: false, error: (r.error as 'conflict' | 'invalid' | 'not_found') || 'invalid' };
    } catch (e) {
      return { ok: false, error: e instanceof AuthError ? 'unauthorized' : 'network' };
    }
  },

  // ── Друзья ──
  async getFriends(username: string): Promise<string[]> {
    const rows = await fetchAll<{ friend_username: string }>((a, b) =>
      supabase.from('friendships').select('friend_username').eq('username', username).order('friend_username').range(a, b));
    return rows.map((r) => r.friend_username);
  },
  /** Кто добавил этого пользователя (входящие заявки = followers минус те, кого добавил он сам). */
  async getFollowers(username: string): Promise<string[]> {
    const rows = await fetchAll<{ username: string }>((a, b) =>
      supabase.from('friendships').select('username').eq('friend_username', username).order('username').range(a, b));
    return rows.map((r) => r.username);
  },
  async getMutualFriends(username: string): Promise<Set<string>> {
    const rows = await fetchAll<{ friend_username: string }>((a, b) =>
      supabase.from('mutual_friends').select('friend_username').eq('username', username).order('friend_username').range(a, b));
    return new Set(rows.map((r) => r.friend_username));
  },
  addFriend: (friend: string) => ok('pp_add_friend', { p_friend: friend }),
  removeFriend: (friend: string) => ok('pp_remove_friend', { p_friend: friend }),

  // ── Бан (публично — только факт) ──
  async isBanned(username: string): Promise<boolean> {
    return (await call<boolean>('pp_is_banned', { p_username: username }, false)) === true;
  },

  // ── Сообщения ──
  async getMessages(other: string, limit = 300): Promise<ChatMessage[]> {
    const rows = await call<MsgRow[]>('pp_get_messages', { p_other: other, p_limit: limit });
    return (rows || []).map((r) => ({
      id: r.id, from: r.from_user, text: r.text || undefined,
      mediaUrl: r.media_url || undefined, mediaType: r.media_type || undefined, mediaId: r.media_id || undefined,
      edited: !!r.edited, read: !!r.read, at: Date.parse(r.at),
    }));
  },
  sendMessage: (to: string, payload: {
    text?: string; mediaUrl?: string; mediaType?: 'image' | 'video'; mediaId?: number | null;
  }) => ok('pp_send_message', {
    p_to: to, p_text: payload.text ?? null, p_media_url: payload.mediaUrl ?? null,
    p_media_type: payload.mediaType ?? null, p_media_id: payload.mediaId ?? null,
  }),
  deleteMessage: (id: number) => ok('pp_delete_message', { p_id: id }),
  editMessage: (id: number, text: string) => ok('pp_edit_message', { p_id: id, p_text: text }),
  async markRead(other: string): Promise<void> { await ok('pp_mark_read', { p_other: other }); },
  async getUnreadCounts(): Promise<Record<string, number>> {
    return (await call<Record<string, number>>('pp_unread_counts')) || {};
  },

  async getOnlineUsernames(): Promise<Set<string>> {
    try {
      const rows = await fetchAll<{ username: string }>((a, b) => supabase.from('online_users').select('username').range(a, b));
      return new Set(rows.map((r) => r.username));
    } catch { return new Set(); } // индикатор «в сети» не критичен
  },

  // ── Журнал изменений ──
  async getChangelog(): Promise<ChangelogEntry[]> {
    const rows = must(await supabase.from('changelog').select('*').order('created_at', { ascending: false }).limit(200)) || [];
    return rows.map((r) => ({
      id: r.id, version: r.version, title: r.title, description: r.description || '',
      author: r.author, at: Date.parse(r.created_at),
    }));
  },
  addChangelogEntry: (version: string, title: string, description: string) =>
    ok('pp_admin_add_changelog', { p_version: version, p_title: title, p_description: description }),

  async getAccountStats(username: string): Promise<AccountStats | null> {
    return must(await supabase.from('user_overview').select('*').eq('username', username).maybeSingle()) as AccountStats | null;
  },

  // ── Реакции на блоки ──
  async getBlockReactions(blockIds: string[]): Promise<Record<string, BlockReaction[]>> {
    const map: Record<string, BlockReaction[]> = {};
    for (let i = 0; i < blockIds.length; i += 100) {
      const rows = must(await supabase.from('block_reactions').select('block_id, username, emoji')
        .in('block_id', blockIds.slice(i, i + 100)).limit(1000)) || [];
      rows.forEach((r) => {
        const id = r.block_id as string;
        (map[id] ||= []).push({ blockId: id, username: r.username as string, emoji: r.emoji as string });
      });
    }
    return map;
  },
  setReaction: (blockId: string, emoji: string) => ok('pp_set_reaction', { p_block_id: blockId, p_emoji: emoji }),
  removeReaction: (blockId: string) => ok('pp_remove_reaction', { p_block_id: blockId }),

  // ── Админ ──
  async adminOverview(): Promise<{ bans: Record<string, Ban>; warnings: Record<string, number> }> {
    const r = await call<{ bans: Record<string, Ban>; warnings: Record<string, number> }>('pp_admin_overview');
    return { bans: r?.bans || {}, warnings: r?.warnings || {} };
  },
  adminBan: (target: string, reason: string) => ok('pp_admin_ban', { p_target: target, p_reason: reason }),
  adminUnban: (target: string) => ok('pp_admin_unban', { p_target: target }),
  adminWarn: (target: string, text: string) => ok('pp_admin_warn', { p_target: target, p_text: text }),
  async adminGetWarnings(target: string): Promise<Warning[]> {
    const rows = await call<{ text: string; at: string }[]>('pp_admin_warnings', { p_target: target });
    return (rows || []).map((w) => ({ text: w.text, at: Date.parse(w.at) }));
  },
  adminClearWarnings: (target: string) => ok('pp_admin_clear_warnings', { p_target: target }),
  adminSetPassword: (target: string, newPw: string) => ok('pp_admin_set_password', { p_target: target, p_new: newPw }),
  adminDeleteUser: (target: string) => ok('pp_admin_delete_user', { p_target: target }),
};

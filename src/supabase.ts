import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import type {
  User, WallBlock, Ban, Warning, ChatMessage, ChangelogEntry, AccountStats, MediaKind, BlockReaction,
} from './types';

// ═══════════════════════════════════════════════════════════
// SUPABASE — один клиент для REST-запросов и для Realtime.
// ═══════════════════════════════════════════════════════════
const SUPABASE_URL = 'https://kryaklbvqkupjcbkjntp.supabase.co';
const SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtyeWFrbGJ2cWt1cGpjYmtqbnRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyNDk1MTEsImV4cCI6MjEwNDgyNTUxMX0.-DToXzto4R2Jb1kq11JN_ZMa6SIZGYymX9AzkxAoD3c';
const MEDIA_BUCKET = 'media';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface UserRow {
  username: string; password: string; display_name: string; bio: string;
  avatar: string; avatar_img: string | null; avatar_media_id: number | null;
  color: string; role: string | null;
}
function userFromRow(row: UserRow): User {
  return {
    username: row.username, password: row.password, displayName: row.display_name,
    bio: row.bio || '', avatar: row.avatar, avatarImg: row.avatar_img || undefined,
    avatarMediaId: row.avatar_media_id || undefined, color: row.color,
    role: (row.role as 'admin') || undefined,
  };
}
function userToRow(u: User): UserRow {
  return {
    username: u.username, password: u.password, display_name: u.displayName,
    bio: u.bio || '', avatar: u.avatar, avatar_img: u.avatarImg || null,
    avatar_media_id: u.avatarMediaId || null, color: u.color, role: u.role || null,
  };
}

export async function uploadMedia(
  file: File, folder: string, ownerUsername: string, kind: MediaKind
): Promise<{ url: string; id: number | null } | null> {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error: upErr } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file);
  if (upErr) return null;
  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  const url = data.publicUrl;

  let id: number | null = null;
  try {
    const { data: mediaRow } = await supabase
      .from('media')
      .insert({ owner_username: ownerUsername, url, kind, mime_type: file.type || null })
      .select('id')
      .single();
    id = mediaRow?.id ?? null;
  } catch { /* best-effort */ }

  return { url, id };
}

export const DB = {
  async getUser(username: string): Promise<User | null> {
    const { data } = await supabase.from('users').select('*').eq('username', username).maybeSingle();
    return data ? userFromRow(data as UserRow) : null;
  },
  async setUser(username: string, u: User): Promise<boolean> {
    const { error } = await supabase.from('users').upsert(userToRow(u), { onConflict: 'username' });
    return !error;
  },
  async getAllUsers(): Promise<User[]> {
    const { data } = await supabase.from('users').select('*');
    return (data || []).map((r) => userFromRow(r as UserRow));
  },
  async deleteUser(username: string): Promise<boolean> {
    const { error, count } = await supabase.from('users').delete({ count: 'exact' }).eq('username', username);
    return !error && !!count && count > 0;
  },

  async getWall(username: string): Promise<WallBlock[]> {
    const { data } = await supabase.from('walls').select('blocks').eq('username', username).maybeSingle();
    return (data?.blocks as WallBlock[]) || [];
  },
  async setWall(username: string, blocks: WallBlock[]): Promise<boolean> {
    const { error } = await supabase.from('walls').upsert({ username, blocks }, { onConflict: 'username' });
    return !error;
  },

  async getFriends(username: string): Promise<string[]> {
    const { data } = await supabase.from('friendships').select('friend_username').eq('username', username);
    return (data || []).map((r) => r.friend_username as string);
  },
  async addFriend(username: string, friend: string): Promise<boolean> {
    const { error } = await supabase
      .from('friendships')
      .upsert({ username, friend_username: friend }, { onConflict: 'username,friend_username' });
    return !error;
  },
  async removeFriend(username: string, friend: string): Promise<boolean> {
    const { error, count } = await supabase
      .from('friendships').delete({ count: 'exact' })
      .eq('username', username).eq('friend_username', friend);
    return !error && !!count && count > 0;
  },
  async getMutualFriends(username: string): Promise<Set<string>> {
    const { data } = await supabase.from('mutual_friends').select('friend_username').eq('username', username);
    return new Set((data || []).map((r) => r.friend_username as string));
  },

  async getBan(username: string): Promise<Ban | null> {
    const { data } = await supabase.from('bans').select('*').eq('username', username).maybeSingle();
    return data as Ban | null;
  },
  async setBan(username: string, reason: string): Promise<boolean> {
    const { error } = await supabase
      .from('bans').upsert({ username, reason, at: new Date().toISOString() }, { onConflict: 'username' });
    return !error;
  },
  async removeBan(username: string): Promise<boolean> {
    const { error, count } = await supabase.from('bans').delete({ count: 'exact' }).eq('username', username);
    return !error && !!count && count > 0;
  },
  async getAllBans(): Promise<Record<string, Ban>> {
    const { data } = await supabase.from('bans').select('*');
    const obj: Record<string, Ban> = {};
    (data || []).forEach((r) => { obj[(r as Ban).username] = r as Ban; });
    return obj;
  },
  async getWarnings(username: string): Promise<Warning[]> {
    const { data } = await supabase.from('warnings').select('*').eq('username', username).order('at');
    return (data || []).map((r) => ({ text: r.text, at: new Date(r.at).getTime() }));
  },
  async addWarning(username: string, text: string): Promise<boolean> {
    const { error } = await supabase.from('warnings').insert({ username, text });
    return !error;
  },
  async clearWarnings(username: string): Promise<boolean> {
    const { error } = await supabase.from('warnings').delete().eq('username', username);
    return !error;
  },

  async getMessages(a: string, b: string): Promise<ChatMessage[]> {
    const { data } = await supabase
      .from('messages').select('*')
      .or(`and(from_user.eq.${a},to_user.eq.${b}),and(from_user.eq.${b},to_user.eq.${a})`)
      .order('at');
    return (data || []).map((r) => ({
      id: r.id, from: r.from_user, text: r.text || undefined,
      mediaUrl: r.media_url || undefined, mediaType: r.media_type || undefined, mediaId: r.media_id || undefined,
      edited: !!r.edited, read: !!r.read, at: new Date(r.at).getTime(),
    }));
  },
  async sendMessage(a: string, b: string, payload: {
    text?: string; mediaUrl?: string; mediaType?: 'image' | 'video'; mediaId?: number | null;
  }): Promise<boolean> {
    const { error } = await supabase.from('messages').insert({
      from_user: a, to_user: b, text: payload.text || null,
      media_url: payload.mediaUrl || null, media_type: payload.mediaType || null, media_id: payload.mediaId || null,
    });
    return !error;
  },
  async deleteMessage(id: number): Promise<boolean> {
    const { error, count } = await supabase.from('messages').delete({ count: 'exact' }).eq('id', id);
    return !error && !!count && count > 0;
  },
  async editMessage(id: number, text: string): Promise<boolean> {
    const { error, count } = await supabase
      .from('messages').update({ text, edited: true }, { count: 'exact' }).eq('id', id);
    return !error && !!count && count > 0;
  },
  async markRead(me: string, other: string): Promise<void> {
    await supabase.from('messages').update({ read: true })
      .eq('from_user', other).eq('to_user', me).eq('read', false);
  },
  async getUnreadCounts(me: string): Promise<Record<string, number>> {
    const { data } = await supabase.from('messages').select('from_user').eq('to_user', me).eq('read', false);
    const counts: Record<string, number> = {};
    (data || []).forEach((r) => { counts[r.from_user] = (counts[r.from_user] || 0) + 1; });
    return counts;
  },

  async touchLastSeen(username: string): Promise<void> {
    await supabase.from('users').update({ last_seen_at: new Date().toISOString() }).eq('username', username);
  },
  async getOnlineUsernames(): Promise<Set<string>> {
    const { data } = await supabase.from('online_users').select('username');
    return new Set((data || []).map((r) => r.username as string));
  },

  async getChangelog(): Promise<ChangelogEntry[]> {
    const { data } = await supabase.from('changelog').select('*').order('created_at', { ascending: false });
    return (data || []).map((r) => ({
      id: r.id, version: r.version, title: r.title, description: r.description || '',
      author: r.author, at: new Date(r.created_at).getTime(),
    }));
  },
  async addChangelogEntry(version: string, title: string, description: string, author: string): Promise<boolean> {
    const { error } = await supabase.from('changelog').insert({ version, title, description: description || null, author });
    return !error;
  },

  async getAccountStats(username: string): Promise<AccountStats | null> {
    const { data } = await supabase.from('user_overview').select('*').eq('username', username).maybeSingle();
    return data as AccountStats | null;
  },

  // ── Реакции на блоки стены ──
  async getBlockReactions(blockIds: string[]): Promise<Record<string, BlockReaction[]>> {
    if (!blockIds.length) return {};
    const { data } = await supabase.from('block_reactions').select('block_id, username, emoji').in('block_id', blockIds);
    const map: Record<string, BlockReaction[]> = {};
    (data || []).forEach((r) => {
      const id = r.block_id as string;
      (map[id] ||= []).push({ blockId: id, username: r.username as string, emoji: r.emoji as string });
    });
    return map;
  },
  async setReaction(blockId: string, username: string, emoji: string): Promise<boolean> {
    const { error } = await supabase.from('block_reactions').upsert(
      { block_id: blockId, username, emoji, at: new Date().toISOString() },
      { onConflict: 'block_id,username' },
    );
    return !error;
  },
  async removeReaction(blockId: string, username: string): Promise<boolean> {
    const { error } = await supabase.from('block_reactions').delete().eq('block_id', blockId).eq('username', username);
    return !error;
  },
};

export type { RealtimeChannel };

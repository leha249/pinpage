import type { User, WallBlock, ChatMessage, Ban, Warning, ChangelogEntry, AccountStats, BlockReaction, ProfilePatch } from '../types';

// Фейковая «база» для тестов: повторяет поведение серверных функций pp_* (права, взаимная
// дружба, версии стены, защита имени админа) без сети. Токен сессии имитирует localStorage 'pp_session'.
export const state = {
  users: {} as Record<string, User>,
  passwords: {} as Record<string, string>, // имитация таблицы user_secrets
  walls: {} as Record<string, WallBlock[]>,
  wallVersions: {} as Record<string, number>,
  friends: new Set<string>(), // "a>b"
  bans: {} as Record<string, Ban>,
  warnings: [] as { username: string; text: string; at: number; seen: boolean }[],
  messages: [] as (ChatMessage & { to: string })[],
  changelog: [] as ChangelogEntry[],
  reactions: [] as BlockReaction[],
  me: null as string | null,
  failDeleteUser: false,
  failNetwork: false,   // все чтения бросают ошибку (нет связи)
  failWall: false,      // не загружается только стена
  wallConflict: false,  // сервер отвечает «стена изменилась»
  nextId: 1,
  calls: [] as string[],
};

export function reset() {
  state.users = {}; state.passwords = {}; state.walls = {}; state.wallVersions = {};
  state.friends = new Set(); state.bans = {};
  state.warnings = []; state.messages = []; state.changelog = []; state.reactions = [];
  state.me = null; state.failDeleteUser = false; state.failNetwork = false; state.failWall = false; state.wallConflict = false;
  state.nextId = 1; state.calls = [];
}

export function seedUser(username: string, password: string, extra: Partial<User> = {}): User {
  const u: User = {
    username, displayName: username.toUpperCase(), bio: '',
    avatar: username[0].toUpperCase(), color: '#7c6ff7', ...extra,
  };
  state.users[username] = u;
  state.passwords[username] = password;
  return u;
}

const ADMIN = 'leha249';
const RESERVED = [ADMIN, 'admin', 'administrator', 'root', 'support', 'system', 'pinpage', 'null', 'undefined'];
const net = () => { if (state.failNetwork) throw new Error('network'); };
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const isMutual = (a: string, b: string) => state.friends.has(`${a}>${b}`) && state.friends.has(`${b}>${a}`);
const canActOn = (target: string) => state.me !== null && (target === state.me || state.me === ADMIN);

function purge(u: string) {
  delete state.users[u]; delete state.passwords[u]; delete state.walls[u]; delete state.bans[u];
  state.friends = new Set([...state.friends].filter((k) => !k.split('>').includes(u)));
  state.messages = state.messages.filter((m) => m.from !== u && m.to !== u);
  state.reactions = state.reactions.filter((r) => r.username !== u);
  state.warnings = state.warnings.filter((w) => w.username !== u);
}

export class AuthError extends Error {}
export const onAuthLost = () => () => {};

export const DB = {
  // ── Сессия ──
  async login(username: string, pw: string) {
    if (!state.users[username] || state.passwords[username] !== pw) return { ok: false as const, error: 'bad_credentials' as const };
    const ban = state.bans[username];
    if (ban) return { ok: false as const, error: 'banned' as const, reason: ban.reason };
    state.me = username; localStorage.setItem('pp_session', username);
    return { ok: true as const, user: { ...state.users[username] } };
  },
  async register(u: Pick<User, 'username' | 'displayName' | 'avatar' | 'color'>, pw: string) {
    state.calls.push('register:' + u.username);
    if (RESERVED.includes(u.username)) return { ok: false as const, error: 'reserved' as const };
    if (state.users[u.username]) return { ok: false as const, error: 'taken' as const };
    if (pw.length < 6) return { ok: false as const, error: 'invalid' as const };
    state.users[u.username] = { username: u.username, displayName: u.displayName, bio: '', avatar: u.avatar, color: u.color };
    state.passwords[u.username] = pw; state.walls[u.username] = [];
    state.me = u.username; localStorage.setItem('pp_session', u.username);
    return { ok: true as const, user: { ...state.users[u.username] } };
  },
  async resume() {
    net();
    const s = localStorage.getItem('pp_session');
    if (!s) return { ok: false as const, error: 'none' as const };
    if (!state.users[s]) { localStorage.removeItem('pp_session'); return { ok: false as const, error: 'unauthorized' as const }; }
    if (state.bans[s]) { localStorage.removeItem('pp_session'); return { ok: false as const, error: 'banned' as const, reason: state.bans[s].reason }; }
    state.me = s;
    return { ok: true as const, user: { ...state.users[s] } };
  },
  async logout() { state.me = null; localStorage.removeItem('pp_session'); },
  async status() {
    const ban = state.me ? state.bans[state.me] : undefined;
    const fresh = state.warnings.filter((w) => w.username === state.me && !w.seen);
    fresh.forEach((w) => { w.seen = true; });
    return { banned: !!ban, reason: ban?.reason, warnings: fresh.map((w) => ({ text: w.text, at: w.at })) as Warning[] };
  },
  async getMyWarnings(): Promise<Warning[]> {
    return state.warnings.filter((w) => w.username === state.me).map((w) => ({ text: w.text, at: w.at }));
  },
  async changePassword(oldPw: string, newPw: string) {
    const me = state.me;
    if (!me || state.passwords[me] !== oldPw || newPw.length < 6) return false;
    state.passwords[me] = newPw; return true;
  },
  async deleteAccount(pw: string) {
    const me = state.me;
    if (!me || me === ADMIN || state.passwords[me] !== pw) return false;
    state.calls.push('deleteAccount:' + me);
    purge(me); state.me = null; localStorage.removeItem('pp_session');
    return true;
  },

  // ── Профили ──
  async getUser(u: string) { net(); return state.users[u] ? { ...state.users[u] } : null; },
  async getAllUsers() { net(); return Object.values(state.users).map((u) => ({ ...u })); },
  async updateProfile(u: string, patch: ProfilePatch) {
    state.calls.push('updateProfile:' + u);
    if (!state.users[u] || !canActOn(u)) return false;
    const t = state.users[u];
    if (patch.displayName !== undefined) t.displayName = patch.displayName;
    if (patch.bio !== undefined) t.bio = patch.bio;
    if (patch.avatar !== undefined) t.avatar = patch.avatar;
    if (patch.color !== undefined) t.color = patch.color;
    if (patch.avatarImg !== undefined) t.avatarImg = patch.avatarImg ?? undefined;
    if (patch.avatarMediaId !== undefined) t.avatarMediaId = patch.avatarMediaId ?? undefined;
    return true;
  },

  // ── Стена ──
  async getWall(u: string) {
    net(); if (state.failWall) throw new Error('wall');
    return { blocks: clone(state.walls[u] || []), version: String(state.wallVersions[u] || 0) as string | null };
  },
  async setWall(u: string, b: WallBlock[], base: string | null) {
    state.calls.push('setWall:' + u);
    if (state.failNetwork) return { ok: false as const, error: 'network' as const };
    if (!canActOn(u)) return { ok: false as const, error: 'unauthorized' as const };
    if (state.wallConflict && base !== null) return { ok: false as const, error: 'conflict' as const };
    state.walls[u] = clone(b);
    state.wallVersions[u] = (state.wallVersions[u] || 0) + 1;
    return { ok: true as const, version: String(state.wallVersions[u]) };
  },

  // ── Друзья ──
  async getFriends(u: string) { net(); return [...state.friends].filter((k) => k.startsWith(u + '>')).map((k) => k.split('>')[1]); },
  async getFollowers(u: string) { net(); return [...state.friends].filter((k) => k.endsWith('>' + u)).map((k) => k.split('>')[0]); },
  async getMutualFriends(u: string) {
    const s = new Set<string>();
    for (const k of state.friends) { const [a, b] = k.split('>'); if (a === u && state.friends.has(`${b}>${a}`)) s.add(b); }
    return s;
  },
  async addFriend(f: string) { if (!state.me || f === state.me || !state.users[f]) return false; state.friends.add(`${state.me}>${f}`); return true; },
  async removeFriend(f: string) { return !!state.me && state.friends.delete(`${state.me}>${f}`); },
  async isBanned(u: string) { net(); return !!state.bans[u]; },

  // ── Сообщения ──
  async getMessages(other: string, limit = 300): Promise<ChatMessage[]> {
    net();
    const me = state.me;
    return state.messages
      .filter((m) => (m.from === me && m.to === other) || (m.from === other && m.to === me))
      .slice(-limit).map(({ to: _t, ...m }) => ({ ...m }));
  },
  async sendMessage(to: string, p: { text?: string; mediaUrl?: string }) {
    const me = state.me;
    if (!me || !isMutual(me, to)) return false;
    state.messages.push({ id: state.nextId++, from: me, to, text: p.text, mediaUrl: p.mediaUrl, edited: false, read: false, at: Date.now() });
    return true;
  },
  async deleteMessage(id: number) {
    const n = state.messages.length;
    state.messages = state.messages.filter((m) => !(m.id === id && m.from === state.me));
    return state.messages.length < n;
  },
  async editMessage(id: number, text: string) {
    const m = state.messages.find((x) => x.id === id && x.from === state.me);
    if (!m) return false; m.text = text; m.edited = true; return true;
  },
  async markRead(other: string) { state.messages.forEach((m) => { if (m.from === other && m.to === state.me) m.read = true; }); },
  async getUnreadCounts() {
    net();
    const c: Record<string, number> = {};
    state.messages.filter((m) => m.to === state.me && !m.read).forEach((m) => { c[m.from] = (c[m.from] || 0) + 1; });
    return c;
  },
  async getOnlineUsernames() { return new Set<string>(); },

  // ── Журнал изменений ──
  async getChangelog() { net(); return [...state.changelog].sort((a, b) => b.at - a.at); },
  async addChangelogEntry(version: string, title: string, description: string) {
    if (state.me !== ADMIN) return false;
    state.changelog.push({ id: state.nextId++, version, title, description, author: state.me, at: Date.now() }); return true;
  },
  async getAccountStats(u: string): Promise<AccountStats | null> {
    if (!state.users[u]) return null;
    return { username: u, display_name: state.users[u].displayName, role: null, created_at: new Date().toISOString(), friends_count: 0, files_uploaded: 0, warnings_count: 0, is_banned: false };
  },

  // ── Реакции ──
  async getBlockReactions(blockIds: string[]): Promise<Record<string, BlockReaction[]>> {
    const map: Record<string, BlockReaction[]> = {};
    state.reactions.filter((r) => blockIds.includes(r.blockId)).forEach((r) => { (map[r.blockId] ||= []).push({ ...r }); });
    return map;
  },
  async setReaction(blockId: string, emoji: string) {
    const me = state.me; if (!me) return false;
    const i = state.reactions.findIndex((r) => r.blockId === blockId && r.username === me);
    if (i >= 0) state.reactions[i].emoji = emoji; else state.reactions.push({ blockId, username: me, emoji });
    return true;
  },
  async removeReaction(blockId: string) {
    state.reactions = state.reactions.filter((r) => !(r.blockId === blockId && r.username === state.me));
    return true;
  },

  // ── Админ (как на сервере: только админ) ──
  async adminOverview() {
    net();
    const warnings: Record<string, number> = {};
    state.warnings.forEach((w) => { warnings[w.username] = (warnings[w.username] || 0) + 1; });
    return { bans: { ...state.bans }, warnings };
  },
  async adminBan(t: string, reason: string) {
    if (state.me !== ADMIN || t === ADMIN || !state.users[t]) return false;
    state.bans[t] = { username: t, reason, at: new Date().toISOString() }; return true;
  },
  async adminUnban(t: string) { if (state.me !== ADMIN) return false; const had = !!state.bans[t]; delete state.bans[t]; return had; },
  async adminWarn(t: string, text: string) { if (state.me !== ADMIN) return false; state.warnings.push({ username: t, text, at: Date.now(), seen: false }); return true; },
  async adminGetWarnings(t: string): Promise<Warning[]> { return state.warnings.filter((w) => w.username === t).map((w) => ({ text: w.text, at: w.at })); },
  async adminClearWarnings(t: string) { if (state.me !== ADMIN) return false; state.warnings = state.warnings.filter((w) => w.username !== t); return true; },
  async adminSetPassword(t: string, newPw: string) {
    if (state.me !== ADMIN || !state.users[t] || newPw.length < 6) return false;
    state.passwords[t] = newPw; return true;
  },
  async adminDeleteUser(t: string) {
    state.calls.push('adminDeleteUser:' + t);
    if (state.me !== ADMIN || t === ADMIN || state.failDeleteUser || !state.users[t]) return false;
    purge(t); return true;
  },
};

const chain: any = { on: () => chain, subscribe: () => chain };
export const supabase = { channel: () => chain, removeChannel: () => {} };
export const uploadMedia = async () => ({ url: 'https://x/test.png', id: 1 });

import type { User, WallBlock, ChatMessage, Ban, Warning, ChangelogEntry, AccountStats, BlockReaction } from '../types';

export const state = {
  users: {} as Record<string, User>,
  walls: {} as Record<string, WallBlock[]>,
  friends: new Set<string>(), // "a>b"
  bans: {} as Record<string, Ban>,
  warnings: [] as { username: string; text: string; at: number }[],
  messages: [] as (ChatMessage & { to: string })[],
  changelog: [] as ChangelogEntry[],
  reactions: [] as BlockReaction[],
  failDeleteUser: false,
  nextId: 1,
  calls: [] as string[],
};

export function reset() {
  state.users = {}; state.walls = {}; state.friends = new Set(); state.bans = {};
  state.warnings = []; state.messages = []; state.changelog = []; state.reactions = [];
  state.failDeleteUser = false;
  state.nextId = 1; state.calls = [];
}

export function seedUser(username: string, password: string, extra: Partial<User> = {}): User {
  const u: User = {
    username, password, displayName: username.toUpperCase(), bio: '',
    avatar: username[0].toUpperCase(), color: '#7c6ff7', ...extra,
  };
  state.users[username] = u;
  return u;
}

export const DB = {
  async getUser(u: string) { return state.users[u] ? { ...state.users[u] } : null; },
  async setUser(u: string, d: User) { state.calls.push('setUser:' + u); state.users[u] = { ...d }; return true; },
  async getAllUsers() { return Object.values(state.users).map((u) => ({ ...u })); },
  async deleteUser(u: string) {
    state.calls.push('deleteUser:' + u);
    if (state.failDeleteUser || !state.users[u]) return false;
    delete state.users[u]; delete state.walls[u]; return true;
  },
  async getWall(u: string) { return JSON.parse(JSON.stringify(state.walls[u] || [])); },
  async setWall(u: string, b: WallBlock[]) { state.calls.push('setWall:' + u); state.walls[u] = JSON.parse(JSON.stringify(b)); return true; },
  async getFriends(u: string) { return [...state.friends].filter((k) => k.startsWith(u + '>')).map((k) => k.split('>')[1]); },
  async addFriend(a: string, b: string) { state.friends.add(`${a}>${b}`); return true; },
  async removeFriend(a: string, b: string) { return state.friends.delete(`${a}>${b}`); },
  async getMutualFriends(u: string) {
    const s = new Set<string>();
    for (const k of state.friends) { const [a, b] = k.split('>'); if (a === u && state.friends.has(`${b}>${a}`)) s.add(b); }
    return s;
  },
  async getBan(u: string) { return state.bans[u] || null; },
  async setBan(u: string, reason: string) { state.bans[u] = { username: u, reason, at: new Date().toISOString() }; return true; },
  async removeBan(u: string) { const had = !!state.bans[u]; delete state.bans[u]; return had; },
  async getAllBans() { return { ...state.bans }; },
  async getWarnings(u: string): Promise<Warning[]> { return state.warnings.filter((w) => w.username === u).map((w) => ({ text: w.text, at: w.at })); },
  async addWarning(u: string, text: string) { state.warnings.push({ username: u, text, at: Date.now() }); return true; },
  async clearWarnings(u: string) { state.warnings = state.warnings.filter((w) => w.username !== u); return true; },
  async getMessages(a: string, b: string): Promise<ChatMessage[]> {
    return state.messages.filter((m) => (m.from === a && m.to === b) || (m.from === b && m.to === a)).map(({ to: _t, ...m }) => ({ ...m }));
  },
  async sendMessage(a: string, b: string, p: { text?: string; mediaUrl?: string }) {
    state.messages.push({ id: state.nextId++, from: a, to: b, text: p.text, mediaUrl: p.mediaUrl, edited: false, read: false, at: Date.now() });
    return true;
  },
  async deleteMessage(id: number) { const n = state.messages.length; state.messages = state.messages.filter((m) => m.id !== id); return state.messages.length < n; },
  async editMessage(id: number, text: string) { const m = state.messages.find((x) => x.id === id); if (!m) return false; m.text = text; m.edited = true; return true; },
  async markRead(me: string, other: string) { state.messages.forEach((m) => { if (m.from === other && m.to === me) m.read = true; }); },
  async getUnreadCounts(me: string) {
    const c: Record<string, number> = {};
    state.messages.filter((m) => m.to === me && !m.read).forEach((m) => { c[m.from] = (c[m.from] || 0) + 1; });
    return c;
  },
  async touchLastSeen() {},
  async getOnlineUsernames() { return new Set<string>(); },
  async getChangelog() { return [...state.changelog].sort((a, b) => b.at - a.at); },
  async addChangelogEntry(version: string, title: string, description: string, author: string) {
    state.changelog.push({ id: state.nextId++, version, title, description, author, at: Date.now() }); return true;
  },
  async getAccountStats(u: string): Promise<AccountStats | null> {
    if (!state.users[u]) return null;
    return { username: u, display_name: state.users[u].displayName, role: null, created_at: new Date().toISOString(), friends_count: 0, files_uploaded: 0, warnings_count: 0, is_banned: false };
  },
  async getBlockReactions(blockIds: string[]): Promise<Record<string, BlockReaction[]>> {
    const map: Record<string, BlockReaction[]> = {};
    state.reactions.filter((r) => blockIds.includes(r.blockId)).forEach((r) => {
      (map[r.blockId] ||= []).push({ ...r });
    });
    return map;
  },
  async setReaction(blockId: string, username: string, emoji: string) {
    const i = state.reactions.findIndex((r) => r.blockId === blockId && r.username === username);
    if (i >= 0) state.reactions[i].emoji = emoji;
    else state.reactions.push({ blockId, username, emoji });
    return true;
  },
  async removeReaction(blockId: string, username: string) {
    state.reactions = state.reactions.filter((r) => !(r.blockId === blockId && r.username === username));
    return true;
  },
};

const chain: any = { on: () => chain, subscribe: () => chain };
export const supabase = { channel: () => chain, removeChannel: () => {} };
export const uploadMedia = async () => ({ url: 'https://x/test.png', id: 1 });

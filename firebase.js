// ═══════════════════════════════════════════════════════════════
//  firebase.js — База данных MyWall
//  Настрой один раз: вставь свой FIREBASE_URL ниже
// ═══════════════════════════════════════════════════════════════

const FIREBASE_URL = 'https://pinpage-by-leha249-default-rtdb.europe-west1.firebasedatabase.app';
// Пример: 'https://my-project-default-rtdb.firebaseio.com'
//
// Как получить:
//  1. console.firebase.google.com → New project
//  2. Build → Realtime Database → Create database → Test mode
//  3. Скопируй URL из верхней части страницы БД

// ── Внутренний REST-клиент ───────────────────────────────────
const _fb = {
  async get(path) {
    if (!FIREBASE_URL) return null;
    try {
      const r = await fetch(`${FIREBASE_URL}/${path}.json`);
      return r.ok ? r.json() : null;
    } catch { return null; }
  },
  async set(path, data) {
    if (!FIREBASE_URL) return;
    await fetch(`${FIREBASE_URL}/${path}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
  async patch(path, data) {
    if (!FIREBASE_URL) return;
    await fetch(`${FIREBASE_URL}/${path}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
  async del(path) {
    if (!FIREBASE_URL) return;
    await fetch(`${FIREBASE_URL}/${path}.json`, { method: 'DELETE' });
  },
};

// ── localStorage fallback ────────────────────────────────────
const LS_KEY = 'mywall_v4';
const DEMO_DATA = {
  users: {
    leha249: { username:'leha249', password:'admin123', displayName:'Leha ⚡', bio:'создатель этого сайта', avatar:'L', color:'#f59e0b', role:'admin' },
    nova:    { username:'nova',    password:'1234',     displayName:'Nova ✦',  bio:'digital wanderer',              avatar:'N', color:'#7c6ff7' },
    kira:    { username:'kira',    password:'1234',     displayName:'Kira ☽',  bio:'photographer & night owl',      avatar:'K', color:'#ec4899' },
    echo:    { username:'echo',    password:'1234',     displayName:'Echo ◈',  bio:'sound designer · coffee addict',avatar:'E', color:'#10b981' },
  },
  walls: {
    leha249: [
      { id:'a1', type:'text',  x:50,  y:60,  w:320, h:100, content:'это мой сайт и я его создал ⚡\nадминистратор',          style:{fontSize:20,color:'#f59e0b',italic:true,family:'serif'} },
      { id:'a2', type:'text',  x:420, y:55,  w:210, h:80,  content:'leha249\nАдминистратор MyWall',                          style:{fontSize:13,color:''} },
      { id:'a3', type:'music', x:50,  y:205, w:270, h:78,  content:{title:'COPYCAT',artist:'Billie Eilish'} },
    ],
    nova: [
      { id:'n1', type:'text',  x:50,  y:70,  w:300, h:110, content:'welcome to my wall ✦\nthis is my little corner of the internet', style:{fontSize:18,color:'',italic:true,family:'serif'} },
      { id:'n2', type:'text',  x:400, y:55,  w:215, h:86,  content:'currently: ambient music, polaroids, late night drives',          style:{fontSize:12,color:'#7c6ff7'} },
      { id:'n3', type:'image', x:50,  y:225, w:228, h:168, content:'https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=500' },
      { id:'n4', type:'music', x:332, y:200, w:268, h:78,  content:{title:'Midnight City',artist:'M83'} },
    ],
    kira: [
      { id:'k1', type:'image', x:40,  y:40,  w:288, h:202, content:'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=500' },
      { id:'k2', type:'text',  x:375, y:48,  w:228, h:100, content:'catching light\nand letting it go', style:{fontSize:22,color:'#ec4899',italic:true,family:'serif'} },
      { id:'k3', type:'music', x:40,  y:285, w:265, h:78,  content:{title:'Golden Hour',artist:'JVKE'} },
    ],
    echo: [
      { id:'e1', type:'text',  x:40,  y:50,  w:328, h:82,  content:'frequencies & feelings', style:{fontSize:26,color:'#10b981',family:'mono'} },
      { id:'e2', type:'music', x:425, y:40,  w:232, h:78,  content:{title:'Circles',artist:'Mac Miller'} },
      { id:'e3', type:'image', x:40,  y:174, w:265, h:183, content:'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=500' },
    ],
  },
  friends:  { leha249:['nova','kira'], nova:['kira','echo'], kira:['nova'], echo:['nova'] },
  bans:     {},
  warnings: {},
};

function _lsLoad() {
  try { const d = JSON.parse(localStorage.getItem(LS_KEY)); if (d) return d; } catch {}
  return JSON.parse(JSON.stringify(DEMO_DATA));
}
function _lsSave(db) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(db)); } catch {}
}

let _localDB = _lsLoad();
// Seed demo data if fields missing
for (const [u,d] of Object.entries(DEMO_DATA.users))   if (!_localDB.users[u])   _localDB.users[u]=d;
for (const [u,w] of Object.entries(DEMO_DATA.walls))   if (!_localDB.walls[u])   _localDB.walls[u]=w;
for (const [u,f] of Object.entries(DEMO_DATA.friends)) if (!_localDB.friends[u]) _localDB.friends[u]=f;
if (!_localDB.bans)     _localDB.bans = {};
if (!_localDB.warnings) _localDB.warnings = {};
_lsSave(_localDB);

const USE_FIREBASE = !!FIREBASE_URL;

// ═══════════════════════════════════════════════════════════════
//  PUBLIC API  — используй эти функции в index.html и admin.html
// ═══════════════════════════════════════════════════════════════
const DB = {
  isFirebase: USE_FIREBASE,

  // ── USERS ──────────────────────────────────────────────────
  async getUser(username) {
    if (USE_FIREBASE) return _fb.get(`users/${username}`);
    return _localDB.users[username] || null;
  },
  async setUser(username, data) {
    if (USE_FIREBASE) return _fb.set(`users/${username}`, data);
    _localDB.users[username] = data; _lsSave(_localDB);
  },
  async getAllUsers() {
    if (USE_FIREBASE) {
      const u = await _fb.get('users');
      return u ? Object.values(u) : [];
    }
    return Object.values(_localDB.users);
  },
  async deleteUser(username) {
    if (USE_FIREBASE) { await _fb.del(`users/${username}`); await _fb.del(`walls/${username}`); await _fb.del(`friends/${username}`); return; }
    delete _localDB.users[username];
    delete _localDB.walls[username];
    delete _localDB.friends[username];
    _lsSave(_localDB);
  },

  // ── WALLS ──────────────────────────────────────────────────
  async getWall(username) {
    if (USE_FIREBASE) {
      const w = await _fb.get(`walls/${username}`);
      if (!w) return [];
      return Array.isArray(w) ? w : Object.values(w);
    }
    return JSON.parse(JSON.stringify(_localDB.walls[username] || []));
  },
  async setWall(username, blocks) {
    if (USE_FIREBASE) return _fb.set(`walls/${username}`, blocks);
    _localDB.walls[username] = blocks; _lsSave(_localDB);
  },

  // ── FRIENDS ────────────────────────────────────────────────
  async getFriends(username) {
    if (USE_FIREBASE) {
      const f = await _fb.get(`friends/${username}`);
      if (!f) return [];
      return Array.isArray(f) ? f : Object.values(f);
    }
    return [...(_localDB.friends[username] || [])];
  },
  async setFriends(username, list) {
    if (USE_FIREBASE) return _fb.set(`friends/${username}`, list);
    _localDB.friends[username] = list; _lsSave(_localDB);
  },

  // ── BANS ───────────────────────────────────────────────────
  async getBan(username) {
    if (USE_FIREBASE) return _fb.get(`bans/${username}`);
    return _localDB.bans[username] || null;
  },
  async setBan(username, reason) {
    const data = { reason, by:'leha249', at: new Date().toISOString() };
    if (USE_FIREBASE) return _fb.set(`bans/${username}`, data);
    _localDB.bans[username] = data; _lsSave(_localDB);
  },
  async removeBan(username) {
    if (USE_FIREBASE) return _fb.del(`bans/${username}`);
    delete _localDB.bans[username]; _lsSave(_localDB);
  },
  async getAllBans() {
    if (USE_FIREBASE) { const b = await _fb.get('bans'); return b || {}; }
    return _localDB.bans || {};
  },

  // ── WARNINGS ───────────────────────────────────────────────
  async getWarnings(username) {
    if (USE_FIREBASE) {
      const w = await _fb.get(`warnings/${username}`);
      return w ? (Array.isArray(w) ? w : Object.values(w)) : [];
    }
    return _localDB.warnings[username] || [];
  },
  async addWarning(username, text) {
    const entry = { text, by:'leha249', at: new Date().toISOString() };
    const list = await this.getWarnings(username);
    list.push(entry);
    if (USE_FIREBASE) return _fb.set(`warnings/${username}`, list);
    _localDB.warnings[username] = list; _lsSave(_localDB);
  },
  async clearWarnings(username) {
    if (USE_FIREBASE) return _fb.del(`warnings/${username}`);
    delete _localDB.warnings[username]; _lsSave(_localDB);
  },
};

// Экспортируем глобально
window.DB = DB;
window.USE_FIREBASE = USE_FIREBASE;

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useApp } from '../context/AppContext';
import { DB } from '../supabase';
import type { User } from '../types';

const COLORS = ['#7c6ff7', '#ec4899', '#10b981', '#3b82f6', '#f59e0b', '#ef4444'];

export default function AuthScreen() {
  const { setCurrentUser, notify } = useApp();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const userRef = useRef<HTMLInputElement>(null);

  useEffect(() => { userRef.current?.focus(); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const usr = username.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (!usr || !password) { setError('Заполни все поля'); return; }
    setBusy(true);
    try {
      if (mode === 'login') await login(usr);
      else await register(usr);
    } finally {
      setBusy(false);
    }
  }

  async function login(usr: string) {
    const u = await DB.getUser(usr);
    if (!u) { setError('Пользователь не найден'); return; }

    if (u.password !== password) { setError('Неверный пароль'); return; }

    const ban = await DB.getBan(usr);
    if (ban) { setError('Аккаунт заблокирован: ' + ban.reason); return; }

    setCurrentUser(u);
    notify('С возвращением, ' + u.displayName);
  }

  async function register(usr: string) {
    const dn = displayName.trim();
    if (!dn) { setError('Введи отображаемое имя'); return; }
    if (usr.length < 3) { setError('Username минимум 3 символа'); return; }
    if (password.length < 4) { setError('Пароль минимум 4 символа'); return; }
    if (await DB.getUser(usr)) { setError('Username занят'); return; }

    const nu: User = {
      username: usr,
      password,
      displayName: dn,
      bio: '',
      avatar: dn[0].toUpperCase(),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    };
    if (!(await DB.setUser(usr, nu))) { setError('Не удалось создать аккаунт. Попробуй ещё раз.'); return; }
    await DB.setWall(usr, []);
    setCurrentUser(nu);
    notify('Добро пожаловать!');
  }

  const btnLabel = busy ? '...' : mode === 'login' ? 'Войти →' : 'Создать аккаунт →';

  return (
    <div id="auth-screen">
      {[
        { c: 'oklch(64% 0.19 288)', l: '22%', t: '28%', s: 360 },
        { c: 'oklch(65% 0.22 350)', l: '68%', t: '62%', s: 280 },
        { c: 'oklch(74% 0.16 155)', l: '52%', t: '12%', s: 200 },
      ].map((b, i) => (
        <div key={i} className="auth-bg-blob" style={{ background: b.c, opacity: 0.07, width: b.s, height: b.s, left: b.l, top: b.t }} />
      ))}

      <form className="card auth-card" onSubmit={submit}>
        <div className="auth-logo">
          <div className="auth-logo-icon">✦</div>
          <div className="auth-title-row">
            <h1>PinPage</h1>
            <span className="db-dot" title="База данных подключена" />
          </div>
        </div>

        <div className="auth-tabs">
          <button type="button" className={'auth-tab' + (mode === 'login' ? ' active' : '')} onClick={() => setMode('login')}>Войти</button>
          <button type="button" className={'auth-tab' + (mode === 'register' ? ' active' : '')} onClick={() => setMode('register')}>Регистрация</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {mode === 'register' && (
            <div className="auth-field">
              <label>Имя на сайте</label>
              <input className="auth-input" value={displayName} maxLength={40} placeholder="Как тебя звать?" onChange={(e) => setDisplayName(e.target.value)} />
            </div>
          )}
          <div className="auth-field">
            <label>Username</label>
            <input ref={userRef} className="auth-input" value={username} maxLength={24} placeholder="только латиница, без пробелов" autoComplete="username" onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="auth-field" style={{ position: 'relative' }}>
            <label>Пароль</label>
            <input
              className="auth-input" type={showPw ? 'text' : 'password'} value={password}
              placeholder="••••••••" autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              style={{ paddingRight: 76 }} onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button" onClick={() => setShowPw((s) => !s)}
              style={{ position: 'absolute', right: 4, bottom: 6, fontSize: 11, fontWeight: 700, padding: '4px 8px', color: 'var(--text3)' }}
            >
              {showPw ? 'Скрыть' : 'Показать'}
            </button>
          </div>
          {error && <div className="auth-err" role="alert">{error}</div>}
        </div>

        <button className="auth-btn" type="submit" disabled={busy}>{btnLabel}</button>
      </form>
    </div>
  );
}

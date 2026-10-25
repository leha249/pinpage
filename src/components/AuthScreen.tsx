import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useApp } from '../context/AppContext';
import { DB, type AuthFailure } from '../supabase';

const COLORS = ['#7c6ff7', '#ec4899', '#10b981', '#3b82f6', '#f59e0b', '#ef4444'];
const USERNAME_RE = /^[a-z0-9_]+$/;

const ERRORS: Record<AuthFailure, string> = {
  bad_credentials: 'Неверный логин или пароль',
  too_many: 'Слишком много неудачных попыток. Подожди 10 минут и попробуй снова.',
  banned: 'Аккаунт заблокирован',
  taken: 'Username занят',
  invalid: 'Проверь данные: username 3–24 символа (латиница, цифры, _), пароль от 6 символов',
  reserved: 'Это имя зарезервировано, выбери другое',
  network: 'Нет связи с сервером. Попробуй ещё раз.',
};

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
    const usr = username.trim().toLowerCase();
    if (!usr || !password) { setError('Заполни все поля'); return; }
    // Раньше лишние символы молча вырезались (кириллица превращалась в пустую строку) — теперь говорим прямо.
    if (!USERNAME_RE.test(usr)) { setError('Username: только латинские буквы, цифры и _ (без пробелов)'); return; }
    setBusy(true);
    try {
      if (mode === 'login') await login(usr);
      else await register(usr);
    } finally {
      setBusy(false);
    }
  }

  async function login(usr: string) {
    const r = await DB.login(usr, password);
    if (!r.ok) {
      setError(r.error === 'banned' ? 'Аккаунт заблокирован: ' + (r.reason || 'нарушение правил') : ERRORS[r.error]);
      return;
    }
    setCurrentUser(r.user);
    notify('С возвращением, ' + r.user.displayName);
  }

  async function register(usr: string) {
    const dn = displayName.trim();
    if (!dn) { setError('Введи отображаемое имя'); return; }
    if (usr.length < 3) { setError('Username минимум 3 символа'); return; }
    if (password.length < 6) { setError('Пароль минимум 6 символов'); return; }

    const r = await DB.register({
      username: usr, displayName: dn,
      avatar: Array.from(dn)[0].toUpperCase(), // не dn[0]: эмодзи — это пара суррогатов
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }, password);
    if (!r.ok) { setError(ERRORS[r.error]); return; }
    setCurrentUser(r.user);
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
          </div>
        </div>

        <div className="auth-tabs">
          <button type="button" className={'auth-tab' + (mode === 'login' ? ' active' : '')} onClick={() => setMode('login')}>Войти</button>
          <button type="button" className={'auth-tab' + (mode === 'register' ? ' active' : '')} onClick={() => setMode('register')}>Регистрация</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {mode === 'register' && (
            <div className="auth-field">
              <label htmlFor="auth-name">Имя на сайте</label>
              <input id="auth-name" className="auth-input" value={displayName} maxLength={40} placeholder="Как тебя звать?" onChange={(e) => setDisplayName(e.target.value)} />
            </div>
          )}
          <div className="auth-field">
            <label htmlFor="auth-username">Username</label>
            <input id="auth-username" ref={userRef} className="auth-input" value={username} maxLength={24} placeholder="только латиница, без пробелов" autoComplete="username" onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="auth-field" style={{ position: 'relative' }}>
            <label htmlFor="auth-password">Пароль</label>
            <input
              id="auth-password" className="auth-input" type={showPw ? 'text' : 'password'} value={password} maxLength={200}
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

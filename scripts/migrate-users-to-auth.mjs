// ═══════════════════════════════════════════════════════════════════════
// Перенос существующих пользователей PinPage в Supabase Auth.
//
// ЗАПУСК:
//   $env:SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."   # service_role-ключ из дашборда
//   node scripts/migrate-users-to-auth.mjs --commit
//
// Без флага --commit скрипт работает в режиме «dry-run»: показывает, что
// сделает, но ничего не создаёт.
//
// ЧТО ДЕЛАЕТ:
//   1. Читает всех пользователей из public.users.
//   2. Для каждого создаёт auth-пользователя (email + пароль).
//   3. Проставляет public.users.id = auth.uid() (колонка id должна уже быть
//      добавлена — см. sql/security.sql, Фаза 1).
//
// ПАРОЛИ: восстановить исходные пароли из хешей невозможно. Поэтому:
//   * если в БД пароль лежит ОТКРЫТЫМ текстом (старый формат) — он и станет
//     паролем входа;
//   * если пароль захеширован (sha256/pbkdf2) — генерируется случайный,
//     и он сохраняется в scripts/auth-migration-credentials.json.
//
// EMAIL: по умолчанию `<username>@pinpage.local`. Чтобы «забыл пароль» по
// почте работал, замени на реальные адреса — можно передать JSON-маппинг:
//   node scripts/migrate-users-to-auth.mjs --commit --emails emails.json
// где emails.json: { "username": "real@mail.com", ... }
// ═══════════════════════════════════════════════════════════════════════
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';

const URL = 'https://kryaklbvqkupjcbkjntp.supabase.co';
const COMMIT = process.argv.includes('--commit');
const emailArgIdx = process.argv.indexOf('--emails');
const emailMap = emailArgIdx >= 0
  ? JSON.parse(readFileSync(process.argv[emailArgIdx + 1], 'utf8'))
  : {};

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
  console.error('Ошибка: укажи SUPABASE_SERVICE_ROLE_KEY (service_role из Supabase → Project Settings → API).');
  process.exit(1);
}

const isHashed = (pw) => /^[a-f0-9]{64}$/.test(pw) || pw.startsWith('pbkdf2$');

const admin = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: users, error } = await admin.from('users').select('username, password, id');
if (error) {
  console.error('Не удалось прочитать public.users:', error.message);
  process.exit(1);
}

console.log(`Найдено пользователей: ${users.length}. Режим: ${COMMIT ? 'COMMIT' : 'DRY-RUN'}.\n`);

const results = [];
for (const u of users) {
  const email = emailMap[u.username] || `${u.username}@pinpage.local`;
  const password = isHashed(u.password) ? randomBytes(9).toString('base64url') : u.password;

  if (!COMMIT) {
    console.log(`[dry-run] ${u.username} → ${email} (пароль: ${isHashed(u.password) ? 'случайный' : 'из БД'})`);
    results.push({ username: u.username, email, password });
    continue;
  }

  const { data: au, error: aerr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username: u.username },
  });
  if (aerr) {
    console.error(`ОШИБКА ${u.username}: ${aerr.message}`);
    results.push({ username: u.username, email, error: aerr.message });
    continue;
  }

  const { error: uerr } = await admin.from('users').update({ id: au.user.id }).eq('username', u.username);
  if (uerr) console.error(`Не удалось привязать id для ${u.username}: ${uerr.message}`);

  console.log(`✓ ${u.username} → auth.uid()=${au.user.id}`);
  results.push({ username: u.username, email, password, id: au.user.id });
}

if (COMMIT) {
  writeFileSync('scripts/auth-migration-credentials.json', JSON.stringify(results, null, 2));
  console.log('\nГотово. Пароли/соответствия сохранены в scripts/auth-migration-credentials.json');
}

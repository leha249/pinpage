// Удаляет из Storage файлы, на которые больше нет ссылок (удалённые блоки, сообщения,
// аватарки, аккаунты). Нужен service_role-ключ — он даёт полный доступ, поэтому
// запускай только у себя на компьютере и никогда не клади ключ в репозиторий.
//
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_KEY=... node scripts/purge-orphan-media.mjs          # показать
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/purge-orphan-media.mjs --delete                       # удалить
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = process.env.SUPABASE_BUCKET || 'media';
const GRACE_MS = 24 * 3600 * 1000; // свежие файлы не трогаем: их могли только что загрузить
if (!url || !key) { console.error('Нужны SUPABASE_URL и SUPABASE_SERVICE_KEY'); process.exit(1); }
const doDelete = process.argv.includes('--delete');
const sb = createClient(url, key, { auth: { persistSession: false } });

async function fetchAll(table, cols) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(cols).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

async function listAll(prefix = '') {
  const files = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await sb.storage.from(BUCKET).list(prefix, { limit: 100, offset });
    if (error) throw new Error(error.message);
    for (const it of data) {
      const p = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.id === null) files.push(...(await listAll(p))); // папка
      else files.push({ path: p, created: it.created_at ? Date.parse(it.created_at) : 0 });
    }
    if (data.length < 100) break;
  }
  return files;
}

const referenced = new Set();
const add = (u) => { if (typeof u === 'string' && u.includes(`/${BUCKET}/`)) referenced.add(decodeURIComponent(u.split(`/${BUCKET}/`)[1].split('?')[0])); };

for (const w of await fetchAll('walls', 'blocks')) {
  for (const b of w.blocks || []) {
    if (typeof b.content === 'string') add(b.content);
    else if (b.content) { add(b.content.dataUrl); add(b.content.coverUrl); }
  }
}
for (const u of await fetchAll('users', 'avatar_img')) add(u.avatar_img);
for (const m of await fetchAll('messages', 'media_url')) add(m.media_url);

const all = await listAll();
const orphans = all.filter((f) => !referenced.has(f.path) && Date.now() - f.created > GRACE_MS);
console.log(`Файлов в бакете: ${all.length}, используется: ${referenced.size}, лишних: ${orphans.length}`);
orphans.slice(0, 50).forEach((f) => console.log('  ', f.path));
if (!doDelete) { console.log('Это просто просмотр. Для удаления добавь --delete.'); process.exit(0); }
for (let i = 0; i < orphans.length; i += 100) {
  const chunk = orphans.slice(i, i + 100).map((f) => f.path);
  const { error } = await sb.storage.from(BUCKET).remove(chunk);
  if (error) throw new Error(error.message);
}
console.log('Удалено:', orphans.length);

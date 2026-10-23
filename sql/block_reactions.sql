-- ═══════════════════════════════════════════════════════════
-- PinPage — реакции (лайки) на блоки стены.
-- Выполни в SQL-редакторе Supabase (Dashboard → SQL → New query).
-- ═══════════════════════════════════════════════════════════

create table if not exists public.block_reactions (
  block_id text not null,
  username text not null,
  emoji    text not null,
  at       timestamptz not null default now(),
  primary key (block_id, username)
);

-- Один пользователь — одна реакция на блок (повторная — перезапись эмодзи).

alter table public.block_reactions enable row level security;

-- Политики ниже временные и повторяют текущую «открытую» модель приложения
-- (доступ по публичному anon-ключу). После миграции на Supabase Auth их нужно
-- заменить на политики, использующие auth.uid() — см. sql/security.sql.

create policy "block_reactions_select"
  on public.block_reactions for select using (true);

create policy "block_reactions_insert"
  on public.block_reactions for insert with check (true);

create policy "block_reactions_update"
  on public.block_reactions for update using (true) with check (true);

create policy "block_reactions_delete"
  on public.block_reactions for delete using (true);

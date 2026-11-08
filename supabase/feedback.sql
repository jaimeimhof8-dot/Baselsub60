-- Feedback-Modus (Admin-Kommentare zu Elementen der App). Einmal im Supabase SQL Editor ausführen (gefahrlos wiederholbar).
-- «Besitzer» heisst hier: jede Zeile gehört dem Mitglied, das sie angelegt hat (user_id = auth.uid()); niemand sieht fremde Zeilen.
-- Die App zeigt den Feedback-Modus nur Jaime. Voraussetzung: supabase/schema.sql wurde schon ausgeführt (is_member()).
create table if not exists public.app_feedback (
  id         uuid primary key,
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  text       text not null check (char_length(text) between 1 and 2000),
  cat        text not null default 'idee' check (cat in ('fehler','plan','design','idee')),
  status     text not null default 'offen' check (status in ('offen','erledigt')),
  ctx        jsonb not null default '{}'::jsonb check (pg_column_size(ctx) <= 8000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists app_feedback_user_idx on public.app_feedback (user_id, created_at desc);
alter table public.app_feedback enable row level security;
revoke all on public.app_feedback from anon;
grant select, insert, update, delete on public.app_feedback to authenticated;
drop policy if exists "eigenes Feedback lesen"    on public.app_feedback;
drop policy if exists "eigenes Feedback anlegen"  on public.app_feedback;
drop policy if exists "eigenes Feedback ändern"   on public.app_feedback;
drop policy if exists "eigenes Feedback löschen"  on public.app_feedback;
create policy "eigenes Feedback lesen"   on public.app_feedback for select to authenticated using (user_id = auth.uid() and public.is_member());
create policy "eigenes Feedback anlegen" on public.app_feedback for insert to authenticated with check (user_id = auth.uid() and public.is_member());
create policy "eigenes Feedback ändern"  on public.app_feedback for update to authenticated using (user_id = auth.uid() and public.is_member()) with check (user_id = auth.uid() and public.is_member());
create policy "eigenes Feedback löschen" on public.app_feedback for delete to authenticated using (user_id = auth.uid() and public.is_member());

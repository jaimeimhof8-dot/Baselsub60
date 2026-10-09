-- Basel Sub-60: Datenbank für genau zwei Nutzer.
-- Einmal komplett im Supabase-Dashboard unter "SQL Editor" ausführen.
-- Vorher unten die E-Mail-Adresse von Jimoh eintragen.

-- Wer die App benutzen darf
create table if not exists public.members (
  email text primary key,
  name  text not null
);

-- Pro Nutzer eine Zeile mit seinem ganzen Plan-Stand (Haken, Werte, Umplanungen, Tests)
create table if not exists public.plan_state (
  user_id    uuid primary key default auth.uid() references auth.users on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Ist der angemeldete Nutzer in der Mitgliederliste?
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where lower(email) = lower(auth.jwt() ->> 'email'));
$$;

alter table public.members    enable row level security;
alter table public.plan_state enable row level security;

drop policy if exists "Mitglieder sehen die Namen" on public.members;
create policy "Mitglieder sehen die Namen" on public.members
  for select to authenticated using (public.is_member());

-- Jeder sieht und ändert nur seinen eigenen Plan
drop policy if exists "eigener Plan lesen"   on public.plan_state;
drop policy if exists "eigener Plan anlegen" on public.plan_state;
drop policy if exists "eigener Plan ändern"  on public.plan_state;
create policy "eigener Plan lesen"   on public.plan_state for select to authenticated using (user_id = auth.uid() and public.is_member());
create policy "eigener Plan anlegen" on public.plan_state for insert to authenticated with check (user_id = auth.uid() and public.is_member());
create policy "eigener Plan ändern"  on public.plan_state for update to authenticated using (user_id = auth.uid() and public.is_member()) with check (user_id = auth.uid());

-- Die zwei Nutzer
insert into public.members (email, name) values
  ('jaimeimhof8@gmail.com', 'Jaime'),
  ('JIMOH-EMAIL-HIER-EINTRAGEN', 'Jimoh')
on conflict (email) do update set name = excluded.name;

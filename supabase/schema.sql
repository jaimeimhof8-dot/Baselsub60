-- Basel Sub-60: Datenbank für genau zwei Nutzer.
-- Einmal komplett im Supabase-Dashboard unter "SQL Editor" ausführen (kann gefahrlos erneut ausgeführt werden).
-- Vorher unten die E-Mail-Adresse von Jimoh eintragen.

-- Wer die App benutzen darf. Nur serverseitig lesbar; die App bekommt über team() nur die Namen.
create table if not exists public.members (
  email text primary key,
  name  text not null,
  team  text not null default 'basel'
);
-- Ältere Datenbanken: Team-Spalte nachrüsten. Partner = anderes Mitglied im selben Team (Test-Konten bleiben unter sich).
alter table public.members add column if not exists team text not null default 'basel';

-- Team des angemeldeten Nutzers (null für Nicht-Mitglieder)
create or replace function public.my_team() returns text
language sql stable security definer set search_path = public as $$
  select team from public.members where lower(email) = lower(auth.jwt() ->> 'email');
$$;

-- Pro Nutzer eine Zeile mit seinem ganzen Plan-Stand (Haken, Werte, Umplanungen, Tests, Strava-Aktivitäten)
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

-- Namen des Teams für die Anzeige ("mit Jimoh"). Leer für Nicht-Mitglieder. Gibt keine E-Mails heraus.
create or replace function public.team() returns table (name text, is_me boolean)
language sql stable security definer set search_path = public as $$
  select m.name, lower(m.email) = lower(auth.jwt() ->> 'email')
  from public.members m
  where m.team = public.my_team();
$$;

-- Profilwerte des Partners (Arbeitsgewichte + Tests), nur lesen. Gibt nichts sonst aus seinem Plan heraus
-- (keine Notizen, Check-ins, Strava). Ändern kann jeder nur die eigene Zeile, siehe Policies unten.
create or replace function public.partner_profile() returns table (name text, weights jsonb, tests jsonb, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.name, coalesce(p.data -> 'weights', '{}'::jsonb), coalesce(p.data -> 'tests', '{}'::jsonb), p.updated_at
  from public.members m
  join auth.users u        on lower(u.email) = lower(m.email)
  join public.plan_state p on p.user_id = u.id
  where m.team = public.my_team() and lower(m.email) <> lower(auth.jwt() ->> 'email');
$$;

alter table public.members    enable row level security;
alter table public.plan_state enable row level security;

-- Nicht angemeldete Besucher (anon) haben gar keinen Zugriff, auch nicht auf die Funktionen
revoke all on public.members, public.plan_state from anon;
revoke execute on function public.is_member(), public.my_team(), public.team(), public.partner_profile() from public, anon;
grant  execute on function public.is_member(), public.my_team(), public.team(), public.partner_profile() to authenticated;

-- members: keine Policy = kein direkter Zugriff aus der App (nur über team())
drop policy if exists "Mitglieder sehen die Namen" on public.members;
revoke all on public.members from authenticated;

-- plan_state: Jeder sieht und ändert nur seinen eigenen Plan. Löschen geht nur über das Konto (on delete cascade).
drop policy if exists "eigener Plan lesen"   on public.plan_state;
drop policy if exists "eigener Plan anlegen" on public.plan_state;
drop policy if exists "eigener Plan ändern"  on public.plan_state;
create policy "eigener Plan lesen"   on public.plan_state for select to authenticated using (user_id = auth.uid() and public.is_member());
create policy "eigener Plan anlegen" on public.plan_state for insert to authenticated with check (user_id = auth.uid() and public.is_member());
create policy "eigener Plan ändern"  on public.plan_state for update to authenticated using (user_id = auth.uid() and public.is_member()) with check (user_id = auth.uid() and public.is_member());

-- Vorlage für weitere Tabellen mit Nutzerdaten – immer user_id + RLS, sonst sind die Daten für alle Nutzer lesbar:
--   create table public.xyz (id bigint generated always as identity primary key,
--     user_id uuid not null default auth.uid() references auth.users on delete cascade, ...);
--   alter table public.xyz enable row level security;
--   revoke all on public.xyz from anon;
--   create policy "eigene Zeilen" on public.xyz for all to authenticated
--     using (user_id = auth.uid() and public.is_member()) with check (user_id = auth.uid() and public.is_member());

-- Die zwei Nutzer + ein Test-Konto im eigenen Team (sieht Jaime/Jimoh nicht und taucht bei ihnen nicht als Partner auf)
insert into public.members (email, name, team) values
  ('jaimeimhof8@gmail.com', 'Jaime', 'basel'),
  ('jimoh.imhof@outlook.com', 'Jimoh', 'basel'),
  ('test@gmail.com', 'Test', 'test')
on conflict (email) do update set name = excluded.name, team = excluded.team;

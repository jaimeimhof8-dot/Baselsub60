-- Trink-Erinnerung per Push (Edge Function "water", Ernährungs-App). Einmal im SQL Editor ausführen (gefahrlos wiederholbar).
-- Vorher <WEEKLY_CRON_SECRET> unten durch denselben Wert ersetzen wie in supabase/push.sql (gleicher Secret).

-- Push-Abos pro Gerät der Ernährungs-App (getrennt von push_subs, damit der Sonntags-Wochenbericht nicht dorthin geht)
create table if not exists public.water_subs (
  endpoint   text primary key check (char_length(endpoint) <= 1000),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  p256dh     text not null check (char_length(p256dh) <= 200),
  auth       text not null check (char_length(auth) <= 100),
  last_sent  timestamptz,
  fail_count int not null default 0,
  created_at timestamptz not null default now()
);
-- Letzter Wasserstand je Nutzer (meldet die App bei jeder Änderung)
create table if not exists public.water_state (
  user_id    uuid primary key default auth.uid() references auth.users on delete cascade,
  day        text not null check (day ~ '^\d{4}-\d{2}-\d{2}$'),
  ml         int  not null check (ml between 0 and 20000),
  goal       int  not null check (goal between 500 and 10000),
  updated_at timestamptz not null default now()
);
alter table public.water_subs  enable row level security;
alter table public.water_state enable row level security;
revoke all on public.water_subs, public.water_state from anon;
-- Schreiben läuft nur über die Funktion (Service-Rolle); Mitglieder dürfen nur die eigenen Zeilen lesen
grant select on public.water_subs, public.water_state to authenticated;
drop policy if exists "eigene Wasser-Abos"  on public.water_subs;
drop policy if exists "eigener Wasserstand" on public.water_state;
create policy "eigene Wasser-Abos"  on public.water_subs  for select to authenticated using (user_id = auth.uid() and public.is_member());
create policy "eigener Wasserstand" on public.water_state for select to authenticated using (user_id = auth.uid() and public.is_member());

-- Alle 30 Minuten (UTC 06–20 deckt Sommer- und Winterzeit ab). Die Funktion sendet nur zwischen 8 und 21 Uhr Zürcher Zeit.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('water-remind') where exists (select 1 from cron.job where jobname = 'water-remind');
select cron.schedule('water-remind', '*/30 6-20 * * *', $$
  select net.http_post(
    url     := 'https://mwhbjrulzxiwtjvcwojo.supabase.co/functions/v1/water',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<WEEKLY_CRON_SECRET>'),
    body    := '{"action":"remind-all"}'::jsonb
  );
$$);

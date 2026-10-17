-- Wochenbericht per Push (Edge Function "weekly"). Einmal im SQL Editor ausführen (gefahrlos wiederholbar).
-- Vorher <WEEKLY_CRON_SECRET> unten durch denselben Wert wie im Secret der Function ersetzen (steht in supabase/.env.push).

-- Push-Abos pro Gerät. Die App legt sie an und löscht sie; jeder sieht nur seine eigenen.
create table if not exists public.push_subs (
  endpoint   text primary key check (char_length(endpoint) <= 1000),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  p256dh     text not null check (char_length(p256dh) <= 200),
  auth       text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now()
);
alter table public.push_subs enable row level security;
revoke all on public.push_subs from anon;
grant select, insert, update, delete on public.push_subs to authenticated;
drop policy if exists "eigene Push-Abos" on public.push_subs;
create policy "eigene Push-Abos" on public.push_subs for all to authenticated
  using (user_id = auth.uid() and public.is_member()) with check (user_id = auth.uid() and public.is_member());

-- Sonntag 18:00 Schweizer Winterzeit (= 17:00 UTC; der Plan läuft Oktober bis Februar)
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('weekly-report') where exists (select 1 from cron.job where jobname = 'weekly-report');
select cron.schedule('weekly-report', '0 17 * * 0', $$
  select net.http_post(
    url     := 'https://mwhbjrulzxiwtjvcwojo.supabase.co/functions/v1/weekly',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<WEEKLY_CRON_SECRET>'),
    body    := '{"action":"send-all"}'::jsonb
  );
$$);

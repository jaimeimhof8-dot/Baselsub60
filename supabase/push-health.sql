-- Push-Gesundheit und Zeitplan (Edge Function "weekly"). Einmal im SQL Editor ausführen (gefahrlos wiederholbar).
-- Vorher <WEEKLY_CRON_SECRET> unten durch denselben Wert wie in push.sql ersetzen.

-- Letzter Erfolg, Fehlversuche in Folge und letzter Fehler pro Gerät: so wird sichtbar, warum ein Push nicht ankommt
alter table public.push_subs add column if not exists last_ok    timestamptz;
alter table public.push_subs add column if not exists fail_count int not null default 0;
alter table public.push_subs add column if not exists last_error text;

-- Sonntag 18:00 Zürcher Zeit in Sommer- UND Winterzeit: der Cron läuft um 16 und 17 Uhr UTC,
-- die Function sendet nur in der Stunde, in der es in Zürich 18 Uhr ist.
select cron.unschedule('weekly-report') where exists (select 1 from cron.job where jobname = 'weekly-report');
select cron.unschedule('weekly-report-dst') where exists (select 1 from cron.job where jobname = 'weekly-report-dst');
select cron.schedule('weekly-report', '0 17 * * 0', $$
  select net.http_post(
    url     := 'https://mwhbjrulzxiwtjvcwojo.supabase.co/functions/v1/weekly',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<WEEKLY_CRON_SECRET>'),
    body    := '{"action":"send-all"}'::jsonb
  );
$$);
select cron.schedule('weekly-report-dst', '0 16 * * 0', $$
  select net.http_post(
    url     := 'https://mwhbjrulzxiwtjvcwojo.supabase.co/functions/v1/weekly',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<WEEKLY_CRON_SECRET>'),
    body    := '{"action":"send-all"}'::jsonb
  );
$$);

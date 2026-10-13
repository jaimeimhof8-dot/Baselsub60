-- Garmin-Tokens automatisch erneuern (alle 6 Std.). Refresh-Tokens laufen nach 30 Tagen ab, wenn niemand sie benutzt –
-- ohne diesen Cron müsste man nach einem Monat ohne App-Öffnen die Token-Datei neu hochladen.
-- Einmal im SQL Editor ausführen, vorher <GARMIN_CRON_SECRET> ersetzen (gleicher Wert wie im Secret der Function).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('garmin-refresh') where exists (select 1 from cron.job where jobname = 'garmin-refresh');
select cron.schedule('garmin-refresh', '17 */6 * * *', $$
  select net.http_post(
    url     := 'https://mwhbjrulzxiwtjvcwojo.supabase.co/functions/v1/garmin',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<GARMIN_CRON_SECRET>'),
    body    := '{"action":"refresh-all"}'::jsonb
  );
$$);

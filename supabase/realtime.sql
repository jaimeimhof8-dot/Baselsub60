-- Live-Updates: Änderungen am gemeinsamen Plan und am eigenen Stand erreichen offene Apps sofort.
-- Einmal im SQL Editor ausführen. Die App holt die Daten auch ohne das bei Start und Rückkehr in die App.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'shared_edits') then
    alter publication supabase_realtime add table public.shared_edits;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'plan_state') then
    alter publication supabase_realtime add table public.plan_state;
  end if;
end $$;

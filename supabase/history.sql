-- Cloud-Verlauf: automatische Sicherungen von plan_state. Einmal im SQL Editor ausführen (gefahrlos wiederholbar).
-- Vor jeder Änderung wird der alte Stand gesichert: höchstens einmal pro Stunde, und immer vor einer grossen
-- Änderung (viele Einträge weg oder dazu, z. B. Backup eingespielt). Aufbewahrung 45 Tage, die letzten 30 Stände immer.
-- Die App zeigt den Verlauf unter Menü → Backup → „Früheren Stand wiederherstellen“.
create table if not exists public.plan_state_history (
  id       bigint generated always as identity primary key,
  user_id  uuid not null references auth.users on delete cascade,
  data     jsonb not null,
  entries  int not null,
  saved_at timestamptz not null default now()
);
create index if not exists plan_state_history_user on public.plan_state_history (user_id, saved_at desc);
alter table public.plan_state_history enable row level security;
-- Kein direkter Zugriff aus der App, nur über die Funktionen unten (nur eigene Stände)
revoke all on public.plan_state_history from anon, authenticated;

-- Anzahl Einträge eines Stands (wie countEntries in src/merge.js, ohne Tests)
create or replace function public.plan_entries(d jsonb) returns int
language sql immutable set search_path = public as $$
  select coalesce(sum(case when jsonb_typeof(d -> k) = 'object' then (select count(*) from jsonb_object_keys(d -> k)) else 0 end), 0)::int
    + case when jsonb_typeof(d -> 'strava' -> 'acts') = 'object' then (select count(*) from jsonb_object_keys(d -> 'strava' -> 'acts'))::int else 0 end
    + case when jsonb_typeof(d -> 'plan') = 'object' then 1 else 0 end
  from unnest(array['done','val','rpe','notes','sched','skip','edit','checkin','dismiss','weights','sore','extra','solo','onb','review','later']) k;
$$;

create or replace function public.plan_state_snapshot() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n_old int := public.plan_entries(old.data);
  n_new int := public.plan_entries(new.data);
  last_at timestamptz;
begin
  if n_old = 0 then return new; end if;
  select max(saved_at) into last_at from public.plan_state_history where user_id = old.user_id;
  if last_at is null or last_at < now() - interval '1 hour'
     or (abs(n_old - n_new) >= 5 and (n_new * 2 < n_old or n_old * 2 < n_new)) then
    insert into public.plan_state_history (user_id, data, entries) values (old.user_id, old.data, n_old);
    delete from public.plan_state_history h
    where h.user_id = old.user_id and h.saved_at < now() - interval '45 days'
      and h.id not in (select id from public.plan_state_history where user_id = old.user_id order by saved_at desc limit 30);
  end if;
  return new;
end $$;

drop trigger if exists plan_state_snapshot on public.plan_state;
create trigger plan_state_snapshot before update on public.plan_state
  for each row when (old.data is distinct from new.data) execute function public.plan_state_snapshot();

-- Liste der eigenen Stände (ohne Inhalt)
create or replace function public.my_history() returns table (id bigint, saved_at timestamptz, entries int, has_plan boolean)
language sql stable security definer set search_path = public as $$
  select h.id, h.saved_at, h.entries, jsonb_typeof(h.data -> 'plan') = 'object'
  from public.plan_state_history h
  where h.user_id = auth.uid() and public.is_member()
  order by h.saved_at desc limit 60;
$$;

-- Inhalt eines eigenen Stands (die App spielt ihn dann wie ein Backup ein)
create or replace function public.history_data(p_id bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select h.data from public.plan_state_history h
  where h.id = p_id and h.user_id = auth.uid() and public.is_member();
$$;

revoke execute on function public.plan_entries(jsonb), public.plan_state_snapshot(), public.my_history(), public.history_data(bigint) from public, anon;
grant  execute on function public.my_history(), public.history_data(bigint) to authenticated;

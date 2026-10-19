-- Gemeinsamer Gesamtplan: ein importierter Plan (PDF) kann für das ganze Team gelten, nicht nur für ein Konto.
-- Lesen: jedes Mitglied sieht den Plan des eigenen Teams. Schreiben: nur über die Funktionen unten.
-- Ein persönlicher Plan (S.plan, "Nur für mich") hat in der App Vorrang vor dem gemeinsamen.
create table if not exists public.shared_plan (
  team       text primary key,
  data       jsonb not null,
  updated_by text not null,
  updated_at timestamptz not null default now()
);
alter table public.shared_plan enable row level security;
revoke all on public.shared_plan from anon, authenticated;
grant select on public.shared_plan to authenticated;
drop policy if exists "Team liest gemeinsamen Plan" on public.shared_plan;
create policy "Team liest gemeinsamen Plan" on public.shared_plan for select to authenticated
  using (team = public.my_team());

-- Plan für das Team speichern: p_data = {name, importedAt, from, days: {idx: Tag}, blocks, weeks}
create or replace function public.set_shared_plan(p_data jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_team text := public.my_team(); v_name text;
begin
  if v_team is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(p_data) <> 'object' or jsonb_typeof(p_data -> 'days') <> 'object'
     or octet_length(p_data::text) > 1500000 then
    raise exception 'bad_data';
  end if;
  select name into v_name from public.members where lower(email) = lower(auth.jwt() ->> 'email');
  insert into public.shared_plan (team, data, updated_by, updated_at)
  values (v_team, p_data, coalesce(v_name, '?'), now())
  on conflict (team) do update set data = excluded.data, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
end $$;

-- Gemeinsamen Plan entfernen (der eingebaute Plan gilt wieder)
create or replace function public.reset_shared_plan() returns void
language plpgsql security definer set search_path = public as $$
declare v_team text := public.my_team();
begin
  if v_team is null then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.shared_plan where team = v_team;
end $$;

revoke execute on function public.set_shared_plan(jsonb), public.reset_shared_plan() from public, anon;
grant  execute on function public.set_shared_plan(jsonb), public.reset_shared_plan() to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'shared_plan') then
    alter publication supabase_realtime add table public.shared_plan;
  end if;
end $$;

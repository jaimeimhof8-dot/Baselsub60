-- Gemeinsame Planänderungen: eine Einheit (Tag) für alle Mitglieder des Teams ändern.
-- Lesen: jedes Mitglied sieht nur die Änderungen des eigenen Teams. Schreiben: nur über die Funktionen unten
-- (Name und Zeit setzt der Server, nicht der Client). Persönliche Änderungen (S.edit) liegen in der App darüber.
create table if not exists public.shared_edits (
  team       text not null,
  day        int  not null check (day between 0 and 400),
  data       jsonb not null,
  updated_by text not null,
  updated_at timestamptz not null default now(),
  primary key (team, day)
);
alter table public.shared_edits enable row level security;
revoke all on public.shared_edits from anon, authenticated;
grant select on public.shared_edits to authenticated;
drop policy if exists "Team liest gemeinsame Änderungen" on public.shared_edits;
create policy "Team liest gemeinsame Änderungen" on public.shared_edits for select to authenticated
  using (team = public.my_team());

-- Änderung speichern: p_data = {t, k, i: [Übungen], n}
create or replace function public.set_shared_edit(p_day int, p_data jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_team text := public.my_team(); v_name text;
begin
  if v_team is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_day is null or p_day < 0 or p_day > 400 then raise exception 'bad_day'; end if;
  if jsonb_typeof(p_data) <> 'object'
     or jsonb_typeof(p_data -> 'i') <> 'array'
     or jsonb_array_length(p_data -> 'i') not between 1 and 40
     or char_length(coalesce(p_data ->> 't', '')) not between 1 and 120
     or char_length(coalesce(p_data ->> 'n', '')) > 1000
     or coalesce(p_data ->> 'k', '') not in ('kraft','lauf','station','sim','bike','mob','rest')
     or octet_length(p_data::text) > 8000 then
    raise exception 'bad_data';
  end if;
  select name into v_name from public.members where lower(email) = lower(auth.jwt() ->> 'email');
  insert into public.shared_edits (team, day, data, updated_by, updated_at)
  values (v_team, p_day, jsonb_build_object('t', p_data -> 't', 'k', p_data -> 'k', 'i', p_data -> 'i', 'n', coalesce(p_data -> 'n', '""'::jsonb)), coalesce(v_name, '?'), now())
  on conflict (team, day) do update set data = excluded.data, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
end $$;

-- Gemeinsame Änderung zurücksetzen (Original des Plans gilt wieder)
create or replace function public.reset_shared_edit(p_day int) returns void
language plpgsql security definer set search_path = public as $$
declare v_team text := public.my_team();
begin
  if v_team is null then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.shared_edits where team = v_team and day = p_day;
end $$;

revoke execute on function public.set_shared_edit(int, jsonb), public.reset_shared_edit(int) from public, anon;
grant  execute on function public.set_shared_edit(int, jsonb), public.reset_shared_edit(int) to authenticated;

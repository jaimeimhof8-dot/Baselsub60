-- Einheit des Partners für EIN Datum, nur lesen (Dashboard-Tab «Vergleich»). NICHT automatisch ausgeführt:
-- erst nach Prüfung im Supabase-SQL-Editor einspielen (nach schema.sql, das my_team()/members/plan_state anlegt).
--
-- Was herausgegeben wird (und sonst nichts): Name, Datum und je Aktivität des Tages
--   group, time, dist, hr, die Runden (nur d = Meter, t = Sekunden, hr = Puls) und die reduzierte Zeitreihe series (Arrays t, d, hr, v, el, cad; ca. 600 Punkte).
-- NICHT herausgegeben: Aktivitätsname, Startzeit, maxHr, Notizen, Check-ins, Gewichte, RPE, Kalorien, Strava-/Garmin-IDs, Wellness, andere Tage.
-- Wer nicht im selben Team ist (oder niemand angemeldet ist), bekommt keine Zeile. Die eigene Zeile wird nie geliefert.
create or replace function public.partner_session(p_date date)
returns table (name text, day date, acts jsonb)
language sql stable security definer set search_path = public as $$
  select m.name,
         p_date,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'group',  a.v -> 'group',
                    'time',   a.v -> 'time',
                    'dist',   a.v -> 'dist',
                    'hr',     a.v -> 'hr',
                    'laps',   case when jsonb_typeof(a.v -> 'laps') = 'array' then (
                                select coalesce(jsonb_agg(jsonb_build_object('d', l -> 'd', 't', l -> 't', 'hr', l -> 'hr') order by o), '[]'::jsonb)
                                from jsonb_array_elements(a.v -> 'laps') with ordinality as x(l, o)
                              ) else null end,
                    -- Zeitreihe (reduziert, siehe reduceSeries in supabase/functions/garmin/reduce.js): nur diese Arrays, nichts sonst
                    'series', case when jsonb_typeof(a.v -> 'series' -> 't') = 'array' then jsonb_build_object(
                                'n', a.v -> 'series' -> 'n', 't', a.v -> 'series' -> 't', 'd', a.v -> 'series' -> 'd', 'hr', a.v -> 'series' -> 'hr',
                                'v', a.v -> 'series' -> 'v', 'el', a.v -> 'series' -> 'el', 'cad', a.v -> 'series' -> 'cad'
                              ) else null end
                  ))
           from (
             select e.value as v
             from jsonb_each(case when jsonb_typeof(p.data -> 'strava' -> 'acts') = 'object' then p.data -> 'strava' -> 'acts' else '{}'::jsonb end) as e
             where e.value ->> 'date' = to_char(p_date, 'YYYY-MM-DD')
             order by e.value -> 'time' desc nulls last
             limit 20 -- Absicherung: höchstens 20 Aktivitäten je Tag
           ) as a
         ), '[]'::jsonb)
  from public.members m
  join auth.users u        on lower(u.email) = lower(m.email)
  join public.plan_state p on p.user_id = u.id
  where p_date is not null
    and m.team = public.my_team()
    and lower(m.email) <> lower(auth.jwt() ->> 'email');
$$;

-- Wie partner_profile(): nicht angemeldete Besucher (anon) haben keinen Zugriff, nur angemeldete Nutzer.
revoke execute on function public.partner_session(date) from public, anon;
grant  execute on function public.partner_session(date) to authenticated;

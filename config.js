// Supabase-Zugang. Leer lassen = App läuft nur lokal auf dem Gerät, mit Vorschau-Login.
// Werte aus Supabase → Project Settings → API ("Project URL" und "Publishable" bzw. "anon public" Key).
// Dieser Key darf öffentlich sein: die Daten schützt die Row Level Security in supabase/schema.sql.
// Den "Secret"/"service_role"-Key NIE hier eintragen.
// stravaClientId (optional): Client-ID der eigenen Strava-API-App. Das Secret NIE hier eintragen –
// es wird in der App unter Menü → Strava eingegeben und bleibt nur auf dem Gerät.
window.HX_CONFIG = {
  supabaseUrl: "https://mwhbjrulzxiwtjvcwojo.supabase.co",
  supabaseAnonKey: "sb_publishable_srJQv2rw2Njbv10g_eYioA_igQMR1vN",
  stravaClientId: ""
};

// Supabase-Zugang. Leer lassen = App läuft nur lokal auf dem Gerät, ohne Login.
// Werte aus Supabase → Project Settings → API ("Project URL" und "anon public" Key).
// Der anon-Key darf öffentlich sein: die Daten schützt die Row Level Security in supabase/schema.sql.
window.HX_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: ""
};
